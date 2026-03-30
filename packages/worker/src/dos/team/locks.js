// Advisory file locking — claimFiles, releaseFiles, getLockedFiles.
// Each function takes `sql` as the first parameter.

import { normalizePath } from '../../lib/text-utils.js';

const HEARTBEAT_ACTIVE_SECONDS = 60;

export function claimFiles(sql, resolvedAgentId, files, handle, tool) {
  const normalized = files.map(normalizePath);
  const claimed = [];
  const blocked = [];

  for (const file of normalized) {
    // Check if already locked by another agent
    const existing = sql.exec(
      'SELECT agent_id, owner_handle, tool, claimed_at FROM locks WHERE file_path = ?', file
    ).toArray();

    if (existing.length > 0 && existing[0].agent_id !== resolvedAgentId) {
      const lock = existing[0];
      blocked.push({
        file,
        held_by: lock.owner_handle,
        tool: lock.tool || 'unknown',
        claimed_at: lock.claimed_at,
      });
      continue;
    }

    // Claim or refresh the lock
    sql.exec(
      `INSERT INTO locks (file_path, agent_id, owner_handle, tool, claimed_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(file_path) DO UPDATE SET
         agent_id = excluded.agent_id,
         owner_handle = excluded.owner_handle,
         tool = excluded.tool,
         claimed_at = datetime('now')`,
      file, resolvedAgentId, handle || 'unknown', tool || 'unknown'
    );
    claimed.push(file);
  }

  return { ok: true, claimed, blocked };
}

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

export function getLockedFiles(sql) {
  const locks = sql.exec(
    `SELECT l.file_path, l.agent_id, l.owner_handle, l.tool, l.claimed_at,
            ROUND((julianday('now') - julianday(l.claimed_at)) * 1440) as minutes_held
     FROM locks l
     JOIN members m ON m.agent_id = l.agent_id
     WHERE m.last_heartbeat > datetime('now', '-' || ? || ' seconds')
     ORDER BY l.claimed_at DESC`,
    HEARTBEAT_ACTIVE_SECONDS
  ).toArray();

  return { locks };
}
