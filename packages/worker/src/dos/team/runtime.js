const RUNTIME_TOKEN_PATTERN = /^[a-zA-Z0-9_-]+$/;

function normalizeValue(value, maxLength = 50) {
  if (!value || typeof value !== 'string') return null;
  if (value.length > maxLength) return null;
  if (!RUNTIME_TOKEN_PATTERN.test(value)) return null;
  return value;
}

export function inferHostToolFromAgentId(agentId = '') {
  const idx = String(agentId).indexOf(':');
  return idx > 0 ? agentId.slice(0, idx) : 'unknown';
}

export function normalizeRuntimeMetadata(runtimeOrTool, agentId = '') {
  if (!runtimeOrTool || typeof runtimeOrTool === 'string') {
    const hostTool =
      normalizeValue(runtimeOrTool) || inferHostToolFromAgentId(agentId) || 'unknown';
    return {
      hostTool,
      agentSurface: null,
      transport: null,
      tier: null,
      model: null,
    };
  }

  const hostTool =
    normalizeValue(runtimeOrTool.hostTool || runtimeOrTool.host_tool || runtimeOrTool.tool) ||
    inferHostToolFromAgentId(agentId) ||
    'unknown';

  return {
    hostTool,
    agentSurface: normalizeValue(runtimeOrTool.agentSurface || runtimeOrTool.agent_surface),
    transport: normalizeValue(runtimeOrTool.transport),
    tier: normalizeValue(runtimeOrTool.tier),
    model: normalizeValue(runtimeOrTool.model || runtimeOrTool.agent_model),
  };
}
