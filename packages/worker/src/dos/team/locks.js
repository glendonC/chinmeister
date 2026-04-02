// Advisory file locking — claimFiles, releaseFiles, getLockedFiles.
// Each function takes `sql` as the first parameter.

/** @import { LockClaim, DOResult } from '../../types.js' */
import { normalizePath } from '../../lib/text-utils.js';
import { normalizeRuntimeMetadata } from './runtime.js';
import { HEARTBEAT_ACTIVE_WINDOW_S } from '../../lib/constants.js';

/**
 * Claim advisory locks on files. Atomic per-file: owned files refresh, foreign files are blocked.
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId
 * @param {string[]} files - File paths to lock
 * @param {string} handle - Agent's display handle
 * @param {string | Record<string, any>} runtimeOrTool
 * @returns {LockClaim}
 */
export function claimFiles(sql, resolvedAgentId, files, handle, runtimeOrTool) {
  const runtime = normalizeRuntimeMetadata(runtimeOrTool, resolvedAgentId);
  const normalized = files.map(normalizePath);
  const claimed = [];
  const blocked = [];

  for (const file of normalized) {
    // Atomic claim: insert if free, no-op if already held by another agent.
    // ON CONFLICT DO UPDATE only if we already own it (refresh our lock).
    // The WHERE clause makes ownership enforcement part of the SQL constraint,
    // so there's no TOCTOU window between checking and writing.
    sql.exec(
      `INSERT INTO locks (file_path, agent_id, owner_handle, tool, host_tool, agent_surface, claimed_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(file_path) DO UPDATE SET
         owner_handle = excluded.owner_handle,
         tool = excluded.tool,
         host_tool = excluded.host_tool,
         agent_surface = excluded.agent_surface,
         claimed_at = datetime('now')
       WHERE locks.agent_id = excluded.agent_id`,
      file, resolvedAgentId, handle || 'unknown', runtime.tool, runtime.hostTool, runtime.agentSurface
    );

    // Use changes() to determine outcome: if 0 rows changed, the lock is held
    // by another agent (the WHERE clause prevented the update).
    const changed = sql.exec('SELECT changes() as c').toArray()[0].c;
    if (changed === 0) {
      // Lock held by another agent — fetch their details for the blocked response.
      const lock = sql.exec(
        'SELECT owner_handle, tool, host_tool, agent_surface, claimed_at FROM locks WHERE file_path = ?', file
      ).toArray()[0];
      blocked.push({
        file,
        held_by: lock.owner_handle,
        tool: lock.tool || lock.host_tool || 'unknown',
        host_tool: lock.host_tool || lock.tool || 'unknown',
        agent_surface: lock.agent_surface || null,
        claimed_at: lock.claimed_at,
      });
    } else {
      claimed.push(file);
    }
  }

  return { ok: true, claimed, blocked };
}

/**
 * Release advisory locks. If files is null/empty, releases all locks for the agent.
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId
 * @param {string[] | null} files - Specific files to release, or null for all
 * @returns {DOResult}
 */
export function releaseFiles(sql, resolvedAgentId, files) {
  if (!files || files.length === 0) {
    // Release all locks for this agent
    sql.exec('DELETE FROM locks WHERE agent_id = ?', resolvedAgentId);
  } else {
    const normalized = files.map(normalizePath);
    for (const file of normalized) {
      sql.exec('DELETE FROM locks WHERE file_path = ? AND agent_id = ?', file, resolvedAgentId);
    }
  }
  return { ok: true };
}

/**
 * Get all active file locks (only from agents with recent heartbeat or live WebSocket).
 * @param {any} sql - DO SQL handle
 * @param {Set<string>} [connectedAgentIds] - Agent IDs with active WebSocket connections
 * @returns {{ locks: import('../../types.js').LockEntry[] }}
 */
export function getLockedFiles(sql, connectedAgentIds = new Set()) {
  const wsAlive = [...connectedAgentIds];
  const wsPlaceholders = wsAlive.length ? wsAlive.map(() => '?').join(',') : "'__none__'";
  const wsParams = wsAlive.length ? wsAlive : [];

  const locks = sql.exec(
    `SELECT l.file_path, l.agent_id, l.owner_handle, l.tool, l.host_tool, l.agent_surface, l.claimed_at,
            ROUND((julianday('now') - julianday(l.claimed_at)) * 1440) as minutes_held
     FROM locks l
     JOIN members m ON m.agent_id = l.agent_id
     WHERE m.last_heartbeat > datetime('now', '-' || ? || ' seconds')
        OR m.agent_id IN (${wsPlaceholders})
     ORDER BY l.claimed_at DESC`,
    HEARTBEAT_ACTIVE_WINDOW_S, ...wsParams
  ).toArray();

  return { locks };
}
