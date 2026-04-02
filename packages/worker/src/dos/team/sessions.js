// Session tracking (observability) — startSession, endSession, recordEdit, getSessionHistory.
// Each function takes `sql` as the first parameter.

/** @import { DOResult } from '../../types.js' */
import { normalizePath, safeParseJSON } from '../../lib/text-utils.js';
import { normalizeRuntimeMetadata } from './runtime.js';
import { sqlChanges } from '../../lib/validation.js';
import { HEARTBEAT_STALE_WINDOW_S, ACTIVITY_MAX_FILES } from '../../lib/constants.js';

/**
 * Start a new session. Closes any existing open session for this agent first.
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId
 * @param {string} handle - Agent's display handle
 * @param {string} framework - Framework identifier (e.g. "react", "express")
 * @param {string | Record<string, any> | null | undefined} runtimeOrTool
 * @returns {{ ok: boolean, session_id: string }}
 */
export function startSession(sql, resolvedAgentId, handle, framework, runtimeOrTool) {
  const runtime = normalizeRuntimeMetadata(runtimeOrTool, resolvedAgentId);
  // End any existing open session for this agent
  sql.exec(
    `UPDATE sessions SET ended_at = datetime('now') WHERE agent_id = ? AND ended_at IS NULL`,
    resolvedAgentId,
  );
  // Also close orphaned sessions for same owner where agent is no longer active
  // (handles agent_id changes, e.g. --tool flag added/removed)
  sql.exec(
    `UPDATE sessions SET ended_at = datetime('now')
     WHERE handle = ? AND ended_at IS NULL
     AND agent_id NOT IN (
       SELECT agent_id FROM members
       WHERE last_heartbeat > datetime('now', '-' || ? || ' seconds')
     )`,
    handle,
    HEARTBEAT_STALE_WINDOW_S,
  );

  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO sessions (id, agent_id, handle, framework, host_tool, agent_surface, transport, agent_model, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    id,
    resolvedAgentId,
    handle,
    framework || 'unknown',
    runtime.hostTool,
    runtime.agentSurface,
    runtime.transport,
    runtime.model,
  );
  return { ok: true, session_id: id };
}

/**
 * Set the model on the active session and member row (only if not already set).
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId
 * @param {string} model - Model identifier (e.g. "claude-3.5-sonnet")
 * @param {(metric: string) => void} recordMetric
 * @returns {DOResult}
 */
export function enrichSessionModel(sql, resolvedAgentId, model, recordMetric) {
  sql.exec(
    `UPDATE sessions SET agent_model = ? WHERE agent_id = ? AND ended_at IS NULL AND agent_model IS NULL`,
    model,
    resolvedAgentId,
  );
  sql.exec(
    `UPDATE members SET agent_model = ? WHERE agent_id = ? AND agent_model IS NULL`,
    model,
    resolvedAgentId,
  );
  recordMetric(`model:${model}`);
  return { ok: true };
}

/**
 * End an active session by ID.
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId
 * @param {string} sessionId
 * @returns {DOResult}
 */
export function endSession(sql, resolvedAgentId, sessionId) {
  sql.exec(
    `UPDATE sessions SET ended_at = datetime('now') WHERE id = ? AND agent_id = ? AND ended_at IS NULL`,
    sessionId,
    resolvedAgentId,
  );
  if (sqlChanges(sql) === 0)
    return { error: 'Session not found or not owned by this agent', code: 'NOT_FOUND' };
  return { ok: true };
}

/**
 * Record a file edit in the active session. Appends to files_touched and bumps edit_count.
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId
 * @param {string} filePath
 * @returns {{ ok: boolean, skipped?: boolean }}
 */
export function recordEdit(sql, resolvedAgentId, filePath) {
  const normalized = normalizePath(filePath);

  // Find the active session for this agent (or resolved session)
  const sessions = sql
    .exec(
      'SELECT id, files_touched FROM sessions WHERE agent_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
      resolvedAgentId,
    )
    .toArray();

  if (sessions.length === 0) return { ok: true, skipped: true }; // No active session — caller can log if needed

  const session = sessions[0];
  let files = [];
  files = safeParseJSON(session.files_touched, [], 'session.files_touched');
  if (!files.includes(normalized)) {
    files.push(normalized);
    if (files.length > ACTIVITY_MAX_FILES) files = files.slice(-ACTIVITY_MAX_FILES);
  }

  sql.exec(
    `UPDATE sessions SET edit_count = edit_count + 1, files_touched = ? WHERE id = ?`,
    JSON.stringify(files),
    session.id,
  );
  return { ok: true };
}

/**
 * Get session history for the last N days (up to 50 sessions).
 * @param {any} sql - DO SQL handle
 * @param {number} days
 * @returns {{ sessions: import('../../types.js').SessionInfo[] }}
 */
export function getSessionHistory(sql, days) {
  const sessions = sql
    .exec(
      `SELECT handle, framework, host_tool, agent_surface, transport, agent_model, started_at, ended_at,
           edit_count, files_touched, conflicts_hit, memories_saved,
           ROUND((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24 * 60) as duration_minutes
     FROM sessions
     WHERE started_at > datetime('now', '-' || ? || ' days')
     ORDER BY started_at DESC
     LIMIT 50`,
      days,
    )
    .toArray();

  return {
    sessions: sessions.map((s) => ({
      ...s,
      files_touched: (() => {
        try {
          return JSON.parse(s.files_touched || '[]');
        } catch {
          return [];
        }
      })(),
    })),
  };
}
