import { TOOL_CATALOG } from '../catalog.js';
import { HOST_INTEGRATIONS } from '../../../shared/integration-model.js';

const registryIds = new Set(HOST_INTEGRATIONS.map(h => h.id));

function catalogEntryToEvaluation(entry) {
  const inRegistry = registryIds.has(entry.id) ? 1 : 0;
  const mcpSupport = entry.mcpCompatible ? 1 : 0;
  const hasCli = entry.installCmd ? 1 : null;

  let integrationTier = 'discovery-only';
  if (inRegistry) {
    const host = HOST_INTEGRATIONS.find(h => h.id === entry.id);
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
    verdict: entry.mcpCompatible ? 'integrated' : (entry.installCmd ? 'installable' : 'listed'),
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
    const evaluation = catalogEntryToEvaluation(entry);
    await db.saveEvaluation(evaluation);
  }
}
