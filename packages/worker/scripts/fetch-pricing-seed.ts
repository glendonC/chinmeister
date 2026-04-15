#!/usr/bin/env node
// Build-time pricing seed generator.
//
// Fetches LiteLLM's canonical model_prices_and_context_window.json, filters it
// to chat/completion/responses entries, normalizes prices to per-1M-tokens,
// and writes packages/worker/src/lib/pricing-seed.json as a committed build
// artifact. The runtime seeds from this file on a fresh deploy before the
// first cron fires.
//
// This script is NEVER hand-edited. `npm run build:pricing-seed` regenerates
// it. CI bumps it weekly against main so fresh deploys stay within 7 days of
// reality. The runtime refresh (src/lib/refresh-model-prices.ts) takes over
// from there on a 6h cadence.
//
// Failure semantics:
//   - Network failure:  exit 0, preserve existing seed, print WARNING. (CI
//                       continues; the existing committed seed is used.)
//   - Schema failure:   exit 1, do NOT overwrite existing seed. (CI fails;
//                       humans investigate before merging.)
//   - Canary failure:   exit 1, do NOT overwrite. (Same as schema.)
//
// Run with: node --experimental-strip-types packages/worker/scripts/fetch-pricing-seed.ts
// (Node 22+ supports TypeScript type-stripping natively.)

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'lib',
  'pricing-seed.json',
);

// Models that MUST be present with valid input+output pricing for the seed to
// be accepted. These are the lookup targets that would cause visible failures
// if missing. The runtime refresh uses derived validation (>=90% overlap with
// previous snapshot) instead; this hardcoded canary is only used at build time
// where a human sees the CI failure.
const BUILD_CANARY = [
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5',
  'claude-opus-4-6',
  'gpt-5',
  'gemini-2.5-pro',
] as const;

// Modes we KEEP. All other modes (image, embedding, audio_*, rerank, moderation)
// price on different units and don't belong in a text-token pricing table.
const ALLOWED_MODES = new Set(['chat', 'completion', 'responses']);

// Minimum acceptable model count. Anything less means LiteLLM shipped us a
// bad file or our filter is too aggressive.
const MIN_MODELS = 2000;

interface LiteLLMEntry {
  mode?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  [k: string]: unknown;
}

interface SeedModelRow {
  canonical_name: string;
  input_per_1m: number;
  output_per_1m: number;
  cache_creation_per_1m: number | null;
  cache_read_per_1m: number | null;
  input_per_1m_above_200k: number | null;
  output_per_1m_above_200k: number | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  raw: string | null;
}

interface SeedFile {
  _sha: string;
  _fetchedAt: string;
  _models_count: number;
  models: SeedModelRow[];
}

const PER_1M = 1_000_000;

function perMillion(value: number | undefined | null): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value * PER_1M;
}

/**
 * Decide whether an entry is a text-token-priced model we want to store.
 * Nullish (not falsy) check so free-tier models with input_cost_per_token: 0
 * are kept.
 */
function isTextTokenModel(name: string, entry: LiteLLMEntry): boolean {
  if (name === 'sample_spec') return false;
  if (typeof entry !== 'object' || entry == null) return false;
  if (entry.input_cost_per_token == null) return false;
  if (entry.output_cost_per_token == null) return false;
  if (entry.mode != null && !ALLOWED_MODES.has(entry.mode)) return false;
  return true;
}

function transformEntry(name: string, entry: LiteLLMEntry): SeedModelRow {
  return {
    canonical_name: name,
    input_per_1m: perMillion(entry.input_cost_per_token) ?? 0,
    output_per_1m: perMillion(entry.output_cost_per_token) ?? 0,
    cache_creation_per_1m: perMillion(entry.cache_creation_input_token_cost),
    cache_read_per_1m: perMillion(entry.cache_read_input_token_cost),
    input_per_1m_above_200k: perMillion(entry.input_cost_per_token_above_200k_tokens),
    output_per_1m_above_200k: perMillion(entry.output_cost_per_token_above_200k_tokens),
    max_input_tokens: entry.max_input_tokens ?? null,
    max_output_tokens: entry.max_output_tokens ?? null,
    raw: JSON.stringify(entry),
  };
}

async function main(): Promise<void> {
  console.log(`[pricing-seed] fetching ${LITELLM_URL}`);

  let response: Response;
  try {
    response = await fetch(LITELLM_URL, {
      headers: {
        'User-Agent': 'chinwag-pricing-seed',
        Accept: 'application/json',
      },
    });
  } catch (err) {
    console.warn(
      `[pricing-seed] WARNING: fetch failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.warn('[pricing-seed] preserving existing seed file, exit 0');
    process.exit(0);
  }

  if (!response.ok) {
    console.warn(`[pricing-seed] WARNING: HTTP ${response.status} ${response.statusText}`);
    console.warn('[pricing-seed] preserving existing seed file, exit 0');
    process.exit(0);
  }

  const etag = response.headers.get('etag') ?? '';
  // raw.githubusercontent.com ETags are of the form `W/"<blob-sha>"` (weak) or
  // `"<blob-sha>"` (strong). Strip both the W/ prefix and the surrounding quotes
  // so _sha is a clean content identifier. The runtime refresh handles its own
  // If-None-Match separately and doesn't reuse this field.
  const sha = etag.replace(/^W\//, '').replace(/^"|"$/g, '') || 'unknown';

  let data: Record<string, LiteLLMEntry>;
  try {
    data = (await response.json()) as Record<string, LiteLLMEntry>;
  } catch (err) {
    console.error(
      `[pricing-seed] ERROR: JSON parse failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.error('[pricing-seed] NOT overwriting existing seed file, exit 1');
    process.exit(1);
  }

  // Build canary pre-check against the raw data, BEFORE filtering. This
  // catches schema drift (e.g. LiteLLM renamed `input_cost_per_token`) before
  // we'd notice via "my canary is missing after filter."
  for (const name of BUILD_CANARY) {
    const entry = data[name];
    if (!entry) {
      console.error(`[pricing-seed] ERROR: canary model "${name}" not present in source`);
      console.error('[pricing-seed] NOT overwriting existing seed file, exit 1');
      process.exit(1);
    }
    if (entry.input_cost_per_token == null || entry.output_cost_per_token == null) {
      console.error(
        `[pricing-seed] ERROR: canary model "${name}" missing input_cost_per_token or output_cost_per_token`,
      );
      console.error('[pricing-seed] NOT overwriting existing seed file, exit 1');
      process.exit(1);
    }
  }

  // Filter and transform.
  const models: SeedModelRow[] = [];
  let skippedMode = 0;
  let skippedMissingCost = 0;
  for (const [name, entry] of Object.entries(data)) {
    if (name === 'sample_spec') continue;
    if (typeof entry !== 'object' || entry == null) continue;
    if (!isTextTokenModel(name, entry)) {
      if (entry.input_cost_per_token == null || entry.output_cost_per_token == null) {
        skippedMissingCost++;
      } else {
        skippedMode++;
      }
      continue;
    }
    models.push(transformEntry(name, entry));
  }

  if (models.length < MIN_MODELS) {
    console.error(
      `[pricing-seed] ERROR: only ${models.length} models after filter (min ${MIN_MODELS})`,
    );
    console.error('[pricing-seed] NOT overwriting existing seed file, exit 1');
    process.exit(1);
  }

  const seed: SeedFile = {
    _sha: sha,
    _fetchedAt: new Date().toISOString(),
    _models_count: models.length,
    models: models.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)),
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8');

  console.log(
    `[pricing-seed] wrote ${OUTPUT_PATH} (${models.length} models, skipped ${skippedMode} non-text + ${skippedMissingCost} missing-cost, sha ${sha.slice(0, 12)})`,
  );
}

// Only run when invoked directly — allows importing the transforms in tests.
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  await main();
}

export { isTextTokenModel, transformEntry, BUILD_CANARY, MIN_MODELS };
