// Structured audit logging for critical worker operations.
// Outputs JSON to console.log (worker context, not MCP).
// Covers: auth events, team membership changes, session lifecycle.

/**
 * Log a structured audit event.
 * @param {string} action - The operation being logged (e.g., 'auth.success', 'team.join')
 * @param {object} details - Event-specific data
 * @param {string} [details.actor] - Who performed the action (user handle or id)
 * @param {string} [details.outcome] - 'success' or 'failure'
 * @param {object} [details.meta] - Additional context (team_id, agent_id, etc.)
 */
export function auditLog(action, { actor = 'unknown', outcome = 'success', meta = {} } = {}) {
  const entry = {
    audit: true,
    action,
    actor,
    outcome,
    ts: new Date().toISOString(),
    ...meta,
  };
  console.log(JSON.stringify(entry));
}
