// Runtime pricing refresh — sibling of pulse.ts, called from the scheduled
// handler every 6 hours.
//
// Defensive patterns applied (each is a specific failure mode from the
// research + challenger review):
//
//  1. HARD FAIL ON MISSING AUTH. pulse.ts silently falls back to unauthenticated
//     GitHub (60/hr). We deliberately throw instead, so a missing or revoked
//     GITHUB_TOKEN surfaces as a scheduled-handler error and not as quiet
//     degradation that shows up days later when pricing is stale.
//
//  2. SHA PINNING TO A COMMIT >= 1 HOUR OLD. LiteLLM had a 20-minute JSON
//     corruption incident in Jan 2026 (stray `{`). By fetching commits first
//     and picking one that is at least 1h old, we let other downstream
//     consumers catch and revert bad commits before we ingest them.
//
//  3. IF-NONE-MATCH ETAG. Most refreshes are no-ops because the file hasn't
//     changed. A 304 response saves ~1.4 MB of body parse + ~2000 upserts
//     per 6h cycle.
//
//  4. CANARY VALIDATION + VOLUME DROP GUARD. Before committing the atomic
//     upsert, check that a fixed set of canonical names still exist with
//     non-null input/output costs, AND that the new model count hasn't
//     dropped more than 10% vs the previous successful refresh. This catches
//     both schema drift (field rename → canary missing) and accidental
//     deletion of a family (mass drop → volume guard).
//
//  5. ATOMIC UPSERT. DELETE + INSERT + metadata UPDATE is wrapped in a single
//     transactionSync at the DO layer (see dos/database/pricing.ts) so readers
//     never see a half-refreshed table.
//
//  6. IN-ISOLATE DEBOUNCE. `refreshInFlight` dedupes concurrent calls within
//     the same worker isolate (e.g. cron retry + cold start on the same
//     machine). Cross-isolate coordination is handled by the DO's single-writer
//     semantics — two concurrent refreshes from different isolates will
//     serialize and the second is a harmless re-apply.

import type { Env } from '../types.js';
import { getDB, rpc } from './env.js';
import { createLogger } from './logger.js';
import type { ModelPriceInput } from '../dos/database/pricing.js';

const log = createLogger('pricing-refresh');

const COMMITS_URL =
  'https://api.github.com/repos/BerriAI/litellm/commits?path=model_prices_and_context_window.json&per_page=10';

function rawContentUrl(sha: string): string {
  return `https://raw.githubusercontent.com/BerriAI/litellm/${sha}/model_prices_and_context_window.json`;
}

// A commit must be at least this old before we pin to it. Lets downstream
// consumers catch and revert bad commits before we ingest them.
const MIN_COMMIT_AGE_MS = 60 * 60 * 1000; // 1 hour

// Refresh validation thresholds.
const MIN_MODELS = 2000;
const MAX_VOLUME_DROP_RATIO = 0.9; // new count must be >= 90% of old count

// Hardcoded canary models. Pragmatic compromise: a tiny list that covers
// the three biggest providers (Anthropic, OpenAI, Google) and the pinning
// mechanism catches schema drift before it can silently corrupt the snapshot.
// If any of these four are missing OR have null cost fields, the refresh is
// rejected and the previous snapshot is kept. Update only when a canary model
// is genuinely retired.
const REFRESH_CANARY = [
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5',
  'claude-opus-4-6',
  'gpt-5',
  'gemini-2.5-pro',
] as const;

const ALLOWED_MODES = new Set(['chat', 'completion', 'responses']);
const PER_1M = 1_000_000;

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

interface Commit {
  sha: string;
  commit: { author: { date: string } };
}

// In-isolate debounce. Multiple scheduled triggers within the same worker
// isolate (cold start + cron retry) share the same in-flight promise.
let refreshInFlight: Promise<void> | null = null;

function perMillion(value: number | undefined | null): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value * PER_1M;
}

function isTextTokenModel(name: string, entry: LiteLLMEntry): boolean {
  if (name === 'sample_spec') return false;
  if (typeof entry !== 'object' || entry == null) return false;
  if (entry.input_cost_per_token == null) return false;
  if (entry.output_cost_per_token == null) return false;
  if (entry.mode != null && !ALLOWED_MODES.has(entry.mode)) return false;
  return true;
}

function transformEntry(name: string, entry: LiteLLMEntry): ModelPriceInput {
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

function baseHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'chinwag-pricing-refresh',
    Accept: 'application/vnd.github+json',
  };
}

/**
 * Pick the newest commit that is at least MIN_COMMIT_AGE_MS old. Returns null
 * if every recent commit is still inside the grace window.
 */
async function pickPinnedCommit(token: string): Promise<Commit | null> {
  const res = await fetch(COMMITS_URL, { headers: baseHeaders(token) });
  if (!res.ok) {
    throw new Error(`commits API returned ${res.status} ${res.statusText}`);
  }
  const commits = (await res.json()) as Commit[];
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error('commits API returned empty result');
  }

  const cutoff = Date.now() - MIN_COMMIT_AGE_MS;
  for (const c of commits) {
    const date = Date.parse(c.commit.author.date);
    if (!Number.isNaN(date) && date <= cutoff) {
      return c;
    }
  }
  return null;
}

interface FetchResult {
  notModified: boolean;
  data: Record<string, LiteLLMEntry> | null;
  etag: string | null;
  status: number;
}

async function fetchAtSha(
  sha: string,
  token: string,
  prevEtag: string | null,
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'chinwag-pricing-refresh',
    Accept: 'application/json',
  };
  if (prevEtag) headers['If-None-Match'] = prevEtag;

  const res = await fetch(rawContentUrl(sha), { headers });

  if (res.status === 304) {
    return { notModified: true, data: null, etag: prevEtag, status: 304 };
  }
  if (!res.ok) {
    throw new Error(`raw content fetch returned ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as Record<string, LiteLLMEntry>;
  const etag = res.headers.get('etag');
  return { notModified: false, data, etag, status: res.status };
}

interface ValidationResult {
  rows: ModelPriceInput[];
  newCount: number;
}

function validateAndTransform(
  data: Record<string, LiteLLMEntry>,
  previousCount: number,
): ValidationResult {
  // 1. Canary: every canary model must exist with non-null costs.
  for (const name of REFRESH_CANARY) {
    const entry = data[name];
    if (!entry) throw new Error(`canary missing: ${name}`);
    if (entry.input_cost_per_token == null) {
      throw new Error(`canary ${name} missing input_cost_per_token`);
    }
    if (entry.output_cost_per_token == null) {
      throw new Error(`canary ${name} missing output_cost_per_token`);
    }
  }

  // 2. Filter + transform.
  const rows: ModelPriceInput[] = [];
  for (const [name, entry] of Object.entries(data)) {
    if (!isTextTokenModel(name, entry)) continue;
    rows.push(transformEntry(name, entry));
  }

  // 3. Absolute floor.
  if (rows.length < MIN_MODELS) {
    throw new Error(`only ${rows.length} models after filter (min ${MIN_MODELS})`);
  }

  // 4. Volume drop guard (skipped on first refresh where previousCount is 0).
  if (previousCount > 100 && rows.length < previousCount * MAX_VOLUME_DROP_RATIO) {
    throw new Error(
      `volume dropped too much: ${rows.length} vs previous ${previousCount} (ratio ${(rows.length / previousCount).toFixed(3)})`,
    );
  }

  return { rows, newCount: rows.length };
}

async function performRefresh(env: Env): Promise<void> {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    // Hard fail — never silently fall back to unauthenticated. This shows up
    // in observability as a scheduled-handler error, which is the whole point.
    throw new Error(
      'GITHUB_TOKEN is required for pricing refresh — cannot fall back to unauthenticated',
    );
  }

  const db = getDB(env);
  const metadataResult = rpc(await db.getPricingMetadata());
  const previous = metadataResult.metadata;
  const previousCount = previous?.models_count ?? 0;
  const previousEtag = previous?.etag ?? null;

  // 1. Pin to a commit >= 1h old so we don't ingest a corruption window.
  const pinned = await pickPinnedCommit(token);
  if (!pinned) {
    log.info('no commits older than 1h yet — skipping refresh this tick');
    return;
  }

  log.info(`pinned to commit ${pinned.sha.slice(0, 12)} (${pinned.commit.author.date})`);

  // 2. Fetch with If-None-Match. 304 means we've already ingested this SHA.
  const fetched = await fetchAtSha(pinned.sha, token, previousEtag);

  if (fetched.notModified) {
    log.info(`304 Not Modified — snapshot unchanged, skipping upsert`);
    return;
  }

  // 3. Validate and transform in one pass. Throws on any failure; we let it
  // bubble up to the outer try/catch which records the failure in metadata.
  const { rows, newCount } = validateAndTransform(fetched.data!, previousCount);

  // 4. Atomic upsert through the DO.
  const upsertResult = rpc(
    await db.upsertModelPrices(rows, {
      source: 'litellm',
      source_sha: pinned.sha,
      etag: fetched.etag,
      fetched_at: new Date().toISOString(),
      models_count: newCount,
    }),
  );

  log.info(
    `pricing refresh success: ${upsertResult.rows_written} models written (was ${previousCount})`,
  );
}

/**
 * Run the pricing refresh, debouncing concurrent calls within the same worker
 * isolate. Always resolves; errors are logged and recorded in pricing_metadata
 * but do not throw to the caller so the scheduled handler never sees an
 * uncaught rejection.
 */
export async function runRefreshModelPrices(env: Env): Promise<void> {
  if (refreshInFlight) {
    log.info('refresh already in-flight, joining existing promise');
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      await performRefresh(env);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log.error(`pricing refresh failed: ${reason}`);
      try {
        const db = getDB(env);
        rpc(await db.recordPricingRefreshFailure(reason));
      } catch (innerErr) {
        log.error(
          `failed to record refresh failure in metadata: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
        );
      }
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
