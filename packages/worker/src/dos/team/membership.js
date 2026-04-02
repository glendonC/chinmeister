// Team membership — join, leave, heartbeat.
// Each function takes `sql` as the first parameter and operates on the members table.

/** @import { DOResult } from '../../types.js' */
import { normalizeRuntimeMetadata } from './runtime.js';
import { sqlChanges } from '../../lib/validation.js';

/**
 * Join a team. Atomic ownership-safe upsert: re-joining refreshes heartbeat,
 * but an agent_id owned by another user is rejected.
 * @param {any} sql - DO SQL handle (ctx.storage.sql)
 * @param {string} agentId
 * @param {string} ownerId
 * @param {string} handle
 * @param {string | Record<string, any>} runtimeOrTool
 * @param {(metric: string) => void} recordMetric
 * @returns {DOResult}
 */
export function join(sql, agentId, ownerId, handle, runtimeOrTool, recordMetric) {
  const runtime = normalizeRuntimeMetadata(runtimeOrTool, agentId);

  // Atomic ownership-safe upsert: INSERT the new member, but ON CONFLICT only
  // update if the existing row belongs to the same owner. This makes spoofing
  // protection part of the SQL constraint rather than a separate SELECT+check,
  // eliminating any TOCTOU window by construction.
  sql.exec(
    `INSERT INTO members (agent_id, owner_id, handle, host_tool, agent_surface, transport, joined_at, last_heartbeat)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(agent_id) DO UPDATE SET
       handle = excluded.handle,
       host_tool = excluded.host_tool,
       agent_surface = excluded.agent_surface,
       transport = excluded.transport,
       last_heartbeat = datetime('now')
     WHERE members.owner_id = excluded.owner_id`,
    agentId,
    ownerId,
    handle,
    runtime.hostTool,
    runtime.agentSurface,
    runtime.transport,
  );

  // If nothing was inserted or updated, the agent_id is owned by someone else.
  if (sqlChanges(sql) === 0) {
    return { error: 'Agent ID already claimed by another user', code: 'AGENT_CLAIMED' };
  }

  recordMetric('joins');
  recordMetric(`host:${runtime.hostTool}`);
  if (runtime.agentSurface) recordMetric(`surface:${runtime.agentSurface}`);
  if (runtime.transport) recordMetric(`transport:${runtime.transport}`);
  return { ok: true };
}

/**
 * Leave a team. Removes member, their activity, and their locks.
 * If ownerId is provided, only removes if the agent belongs to that owner.
 * @param {any} sql - DO SQL handle
 * @param {string} agentId
 * @param {string | null} ownerId
 * @returns {DOResult}
 */
export function leave(sql, agentId, ownerId) {
  // Atomic ownership check: delete the member only if the owner matches (or no
  // ownerId was provided). Avoids a separate SELECT+check TOCTOU pattern.
  if (ownerId) {
    sql.exec(
      'DELETE FROM locks WHERE agent_id = ? AND agent_id IN (SELECT agent_id FROM members WHERE agent_id = ? AND owner_id = ?)',
      agentId,
      agentId,
      ownerId,
    );
    sql.exec(
      'DELETE FROM activities WHERE agent_id = ? AND agent_id IN (SELECT agent_id FROM members WHERE agent_id = ? AND owner_id = ?)',
      agentId,
      agentId,
      ownerId,
    );
    sql.exec('DELETE FROM members WHERE agent_id = ? AND owner_id = ?', agentId, ownerId);
    if (sqlChanges(sql) === 0) {
      // Could be wrong owner or non-existent agent. Check which.
      const exists = sql.exec('SELECT 1 FROM members WHERE agent_id = ?', agentId).toArray();
      if (exists.length > 0) {
        return { error: 'Not your agent', code: 'NOT_OWNER' };
      }
    }
  } else {
    sql.exec('DELETE FROM locks WHERE agent_id = ?', agentId);
    sql.exec('DELETE FROM activities WHERE agent_id = ?', agentId);
    sql.exec('DELETE FROM members WHERE agent_id = ?', agentId);
    // Fallback: if specific agent_id not found, remove all agents for this owner
    // (handles legacy callers sending user UUID as agentId)
    if (sqlChanges(sql) === 0) {
      sql.exec(
        'DELETE FROM locks WHERE agent_id IN (SELECT agent_id FROM members WHERE owner_id = ?)',
        agentId,
      );
      sql.exec(
        'DELETE FROM activities WHERE agent_id IN (SELECT agent_id FROM members WHERE owner_id = ?)',
        agentId,
      );
      sql.exec('DELETE FROM members WHERE owner_id = ?', agentId);
    }
  }
  return { ok: true };
}

/**
 * Bump an agent's heartbeat timestamp.
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId - Already-resolved agent ID
 * @returns {DOResult}
 */
export function heartbeat(sql, resolvedAgentId) {
  sql.exec(
    "UPDATE members SET last_heartbeat = datetime('now') WHERE agent_id = ?",
    resolvedAgentId,
  );
  if (sqlChanges(sql) === 0) return { error: 'Not a member of this team', code: 'NOT_MEMBER' };
  return { ok: true };
}
