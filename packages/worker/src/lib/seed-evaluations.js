import { TOOL_CATALOG } from '../catalog.js';
import { HOST_INTEGRATIONS } from '@chinwag/shared/integration-model.js';

// Seeds the evaluation DB with registry-derived tools on first access.
// Discovery-only tools (Goose, Warp, CodeRabbit, etc.) are NOT seeded here.
// They enter the DB through POST /tools/batch-evaluate or POST /tools/evaluate,
// which runs the Exa Deep Search pipeline to fill in all metadata automatically.
//
// To seed discovery tools after deploy:
//   POST /tools/batch-evaluate { admin_key, tools: ["Goose by Block", "Warp Terminal", ...] }

const registryIds = new Set(HOST_INTEGRATIONS.map((h) => h.id));

function catalogEntryToEvaluation(entry) {
  const inRegistry = registryIds.has(entry.id) ? 1 : 0;
  const mcpSupport = entry.mcpCompatible ? 1 : 0;
  const hasCli = entry.installCmd ? 1 : null;

  let integrationTier = 'discovery-only';
  if (inRegistry) {
    const host = HOST_INTEGRATIONS.find((h) => h.id === entry.id);
    integrationTier = host?.tier || 'connected';
  }

  return {
    id: entry.id,
    name: entry.name,
    tagline: entry.description || null,
    category: entry.category || null,
    mcp_support: mcpSupport,
    has_cli: hasCli,
    hooks_support: null,
    channel_support: null,
    process_detectable: null,
    open_source: null,
    verdict: entry.mcpCompatible ? 'integrated' : entry.installCmd ? 'installable' : 'listed',
    integration_tier: integrationTier,
    blocking_issues: [],
    metadata: {
      website: entry.website || null,
      installCmd: entry.installCmd || null,
      featured: entry.featured || false,
      mcpConfigurable: entry.mcpConfigurable || false,
    },
    sources: [],
    in_registry: inRegistry,
    evaluated_at: new Date().toISOString(),
    confidence: inRegistry ? 'high' : 'medium',
    evaluated_by: 'seed',
  };
}

export async function seedEvaluations(db) {
  for (const entry of TOOL_CATALOG) {
    await db.saveEvaluation(catalogEntryToEvaluation(entry));
  }
}
