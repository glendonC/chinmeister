// Activity tracking — updateActivity, checkConflicts, reportFile.
// Each function takes `sql` as the first parameter.

import { normalizePath } from '../../lib/text-utils.js';

const HEARTBEAT_ACTIVE_SECONDS = 60;
const ACTIVITY_MAX_FILES = 50;

export function updateActivity(sql, resolvedAgentId, files, summary) {
  const normalized = files.map(normalizePath);

  sql.exec(
    `INSERT INTO activities (agent_id, files, summary, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(agent_id) DO UPDATE SET
       files = excluded.files,
       summary = excluded.summary,
       updated_at = datetime('now')`,
    resolvedAgentId, JSON.stringify(normalized), summary
  );
  sql.exec("UPDATE members SET last_heartbeat = datetime('now') WHERE agent_id = ?", resolvedAgentId);
  return { ok: true };
}

export function checkConflicts(sql, resolvedAgentId, files, recordMetric) {
  const others = sql.exec(
    `SELECT m.agent_id, m.owner_handle, m.tool, a.files, a.summary
     FROM members m
     LEFT JOIN activities a ON a.agent_id = m.agent_id
     WHERE m.agent_id != ?
       AND m.last_heartbeat > datetime('now', '-' || ? || ' seconds')`,
    resolvedAgentId, HEARTBEAT_ACTIVE_SECONDS
  ).toArray();

  const myFiles = new Set(files.map(normalizePath));
  const conflicts = [];

  for (const row of others) {
    if (!row.files) continue;
    const theirFiles = JSON.parse(row.files);
    const overlap = theirFiles.filter(f => myFiles.has(f));
    if (overlap.length > 0) {
      conflicts.push({
        owner_handle: row.owner_handle,
        tool: row.tool || 'unknown',
        files: overlap,
        summary: row.summary || '',
      });
    }
  }

  // Check file locks — files locked by other agents are also conflicts
  const lockedFiles = [];
  const fileList = [...myFiles];
  if (fileList.length > 0) {
    const placeholders = fileList.map(() => '?').join(',');
    const lockRows = sql.exec(
      `SELECT file_path, owner_handle, tool, claimed_at FROM locks
       WHERE file_path IN (${placeholders}) AND agent_id != ?`,
      ...fileList, resolvedAgentId
    ).toArray();
    for (const lock of lockRows) {
      lockedFiles.push({
        file: lock.file_path,
        held_by: lock.owner_handle,
        tool: lock.tool || 'unknown',
        claimed_at: lock.claimed_at,
      });
    }
  }

  recordMetric('conflict_checks');
  // Record conflicts in active session for the requesting agent
  if (conflicts.length > 0 || lockedFiles.length > 0) {
    recordMetric('conflicts_found');
    sql.exec(
      `UPDATE sessions SET conflicts_hit = conflicts_hit + 1
       WHERE agent_id = ? AND ended_at IS NULL`,
      resolvedAgentId
    );
  }

  return { conflicts, locked: lockedFiles };
}

export function reportFile(sql, resolvedAgentId, filePath) {
  const normalized = normalizePath(filePath);

  const existing = sql.exec(
    'SELECT files FROM activities WHERE agent_id = ?', resolvedAgentId
  ).toArray();

  let files = [];
  if (existing.length > 0 && existing[0].files) {
    files = JSON.parse(existing[0].files);
  }

  if (!files.includes(normalized)) {
    files.push(normalized);
    if (files.length > ACTIVITY_MAX_FILES) files = files.slice(-ACTIVITY_MAX_FILES);
  }

  sql.exec(
    `INSERT INTO activities (agent_id, files, summary, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(agent_id) DO UPDATE SET
       files = excluded.files,
       updated_at = datetime('now')`,
    resolvedAgentId, JSON.stringify(files), `Editing ${normalized}`
  );
  sql.exec("UPDATE members SET last_heartbeat = datetime('now') WHERE agent_id = ?", resolvedAgentId);
  return { ok: true };
}
