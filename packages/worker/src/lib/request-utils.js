const RUNTIME_TOKEN_PATTERN = /^[a-zA-Z0-9_-]+$/;
const AGENT_ID_PATTERN = /^[a-zA-Z0-9:._-]{1,60}$/;

export function getAgentId(request, user) {
  const agentId = request.headers.get('X-Agent-Id');
  if (agentId && typeof agentId === 'string' && AGENT_ID_PATTERN.test(agentId)) {
    return agentId;
  }
  return user.id;
}

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

export function getAgentRuntime(request, user) {
  const agentId = getAgentId(request, user);
  const hostTool = getRuntimeHeader(request, 'X-Agent-Host-Tool') || getToolFromAgentId(agentId);
  const agentSurface = getRuntimeHeader(request, 'X-Agent-Surface');
  const transport = getRuntimeHeader(request, 'X-Agent-Transport');
  const tier = getRuntimeHeader(request, 'X-Agent-Tier');

  return {
    agentId,
    tool: hostTool || 'unknown',
    host_tool: hostTool || 'unknown',
    hostTool: hostTool || 'unknown',
    agent_surface: agentSurface || null,
    agentSurface: agentSurface || null,
    transport: transport || null,
    tier: tier || null,
  };
}

export function sanitizeTags(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(t => typeof t === 'string')
    .map(t => t.slice(0, 50).toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function parseTeamPath(path) {
  const match = path.match(/^\/teams\/(t_[a-f0-9]{16})\/([a-z]+)$/);
  if (!match) return null;
  return { teamId: match[1], action: match[2] };
}

const ERROR_CODE_STATUS = {
  NOT_MEMBER: 403,
  NOT_OWNER: 403,
  AGENT_CLAIMED: 409,
  NOT_FOUND: 404,
};

export function teamErrorStatus(result) {
  // Structured error codes (preferred path)
  if (result?.code && ERROR_CODE_STATUS[result.code]) {
    return ERROR_CODE_STATUS[result.code];
  }
  // Legacy fallback: string matching for callers that pass raw error messages
  const msg = typeof result === 'string' ? result : result?.error;
  if (msg?.includes('Not a member') || msg?.includes('Not your agent') || msg?.includes('Only the author')) {
    return 403;
  }
  return 400;
}
