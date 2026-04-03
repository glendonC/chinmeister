// Identity resolution — maps an agent ID (possibly partial) to the canonical
// agent_id stored in the members table, with ownership verification.
//
// Resolution chain:
//   1. Exact match on agent_id
//   2. Prefix match (agentId LIKE 'input:%') — supports tool-scoped IDs
// Both steps verify owner_id when provided.

/**
 * Resolve an agent ID to its canonical form, verifying ownership if ownerId is provided.
 * @param {SqlStorage} sql
 * @param {string} agentId - The agent ID to resolve (exact or prefix)
 * @param {string|null} [ownerId] - If provided, must match the member's owner_id
 * @returns {string|null} The resolved canonical agent_id, or null if not found/unauthorized
 */
export function resolveOwnedAgentId(sql, agentId, ownerId = null) {
  // 1. Exact match
  const exact = sql
    .exec('SELECT agent_id, owner_id FROM members WHERE agent_id = ?', agentId)
    .toArray()[0];
  if (exact) {
    return !ownerId || exact.owner_id === ownerId ? /** @type {string} */ (exact.agent_id) : null;
  }

  // 2. Prefix match — find most-recently-active member whose ID starts with the input
  const prefixed = sql
    .exec(
      "SELECT agent_id, owner_id FROM members WHERE agent_id LIKE ? || ':%' ORDER BY last_heartbeat DESC LIMIT 1",
      agentId,
    )
    .toArray()[0];
  if (prefixed) {
    return !ownerId || prefixed.owner_id === ownerId
      ? /** @type {string} */ (prefixed.agent_id)
      : null;
  }

  return null;
}
