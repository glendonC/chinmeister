/** @import { AgentRuntime, User, TeamPathResult } from '../types.js' */

const RUNTIME_TOKEN_PATTERN = /^[a-zA-Z0-9_-]+$/;
const AGENT_ID_PATTERN = /^[a-zA-Z0-9:._-]{1,60}$/;

/**
 * Extract agent ID from request headers, falling back to user.id.
 * @param {Request} request
 * @param {User} user
 * @returns {string}
 */
export function getAgentId(request, user) {
  const agentId = request.headers.get('X-Agent-Id');
  if (agentId && typeof agentId === 'string' && AGENT_ID_PATTERN.test(agentId)) {
    return agentId;
  }
  return user.id;
}

/**
 * Extract tool name from a prefixed agent ID (e.g. "cursor:abc123" -> "cursor").
 * @param {string} agentId
 * @returns {string}
 */
export function getToolFromAgentId(agentId) {
  const idx = agentId.indexOf(':');
  return idx > 0 ? agentId.slice(0, idx) : 'unknown';
}

function getRuntimeHeader(request, name, maxLength = 50) {
  const value = request.headers.get(name);
  if (!value || typeof value !== 'string') return null;
  if (value.length > maxLength) return null;
  if (!RUNTIME_TOKEN_PATTERN.test(value)) return null;
  return value;
}

/**
 * Extract full runtime metadata from request headers.
 * @param {Request} request
 * @param {User} user
 * @returns {AgentRuntime}
 */
export function getAgentRuntime(request, user) {
  const agentId = getAgentId(request, user);
  const hostTool = getRuntimeHeader(request, 'X-Agent-Host-Tool') || getToolFromAgentId(agentId);
  const agentSurface = getRuntimeHeader(request, 'X-Agent-Surface');
  const transport = getRuntimeHeader(request, 'X-Agent-Transport');
  const tier = getRuntimeHeader(request, 'X-Agent-Tier');

  return {
    agentId,
    hostTool: hostTool || 'unknown',
    agentSurface: agentSurface || null,
    transport: transport || null,
    tier: tier || null,
  };
}

/**
 * Sanitize an array of tag strings: lowercase, trim, cap length and count.
 * @param {any} arr
 * @returns {string[]}
 */
export function sanitizeTags(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((t) => typeof t === 'string')
    .map((t) => t.slice(0, 50).toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 50);
}

/**
 * Parse a team route path like "/teams/t_abc123/context" into { teamId, action }.
 * @param {string} path
 * @returns {TeamPathResult | null}
 */
export function parseTeamPath(path) {
  const match = path.match(/^\/teams\/(t_[a-f0-9]{16})\/([a-z]+)$/);
  if (!match) return null;
  return { teamId: match[1], action: match[2] };
}

/**
 * Map a DO error result to an HTTP status code.
 * Prefers the structured `code` field; falls back to message-sniffing
 * for backwards compatibility with any callers that haven't migrated yet.
 *
 * @param {{ error: string, code?: string }} result - DO error result
 * @returns {number} HTTP status code
 */
export function teamErrorStatus(result) {
  // Structured code path (preferred)
  const code = typeof result === 'object' && result !== null ? result.code : undefined;
  if (code) {
    switch (code) {
      case 'FORBIDDEN':
      case 'NOT_MEMBER':
      case 'NOT_OWNER':
        return 403;
      case 'NOT_FOUND':
        return 404;
      case 'AGENT_CLAIMED':
      case 'CONFLICT':
        return 409;
      case 'INTERNAL':
        return 500;
      default:
        return 400;
    }
  }

  // Legacy fallback: sniff the error message string
  const msg = typeof result === 'string' ? result : result?.error;
  if (
    msg?.includes('Not a member') ||
    msg?.includes('Not your agent') ||
    msg?.includes('Only the author')
  ) {
    return 403;
  }
  return 400;
}
