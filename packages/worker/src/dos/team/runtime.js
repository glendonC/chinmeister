/** @import { RuntimeMetadata } from '../../types.js' */

const RUNTIME_TOKEN_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate and cap a single runtime metadata value.
 * @param {any} value
 * @param {number} [maxLength=50]
 * @returns {string | null}
 */
function normalizeValue(value, maxLength = 50) {
  if (!value || typeof value !== 'string') return null;
  if (value.length > maxLength) return null;
  if (!RUNTIME_TOKEN_PATTERN.test(value)) return null;
  return value;
}

/**
 * Extract the host tool name from a prefixed agent ID (e.g. "cursor:abc" -> "cursor").
 * @param {string} [agentId='']
 * @returns {string}
 */
export function inferHostToolFromAgentId(agentId = '') {
  const idx = String(agentId).indexOf(':');
  return idx > 0 ? agentId.slice(0, idx) : 'unknown';
}

/**
 * Normalize runtime metadata from either a string tool name or a runtime object.
 * Always returns a complete RuntimeMetadata with no undefined fields.
 * @param {string | Record<string, any> | null | undefined} runtimeOrTool
 * @param {string} [agentId='']
 * @returns {RuntimeMetadata}
 */
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
