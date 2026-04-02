// Ephemeral agent messages — sendMessage, getMessages.
// Messages auto-expire after 1 hour.
// Each function takes `sql` as the first parameter.

import { normalizeRuntimeMetadata } from './runtime.js';

/**
 * Send a message from one agent to another (or broadcast to all).
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId
 * @param {string} handle - Sender's display handle
 * @param {string | Record<string, any>} runtimeOrTool
 * @param {string} text - Message content
 * @param {string | null} targetAgent - Target agent ID, or null for broadcast
 * @param {(metric: string) => void} recordMetric
 * @returns {{ ok: boolean, id: string }}
 */
export function sendMessage(
  sql,
  resolvedAgentId,
  handle,
  runtimeOrTool,
  text,
  targetAgent,
  recordMetric,
) {
  const runtime = normalizeRuntimeMetadata(runtimeOrTool, resolvedAgentId);
  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO messages (id, agent_id, handle, host_tool, agent_surface, target_agent, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    id,
    resolvedAgentId,
    handle || 'unknown',
    runtime.hostTool,
    runtime.agentSurface,
    targetAgent || null,
    text,
  );
  recordMetric('messages_sent');
  return { ok: true, id };
}

/**
 * Get messages for an agent (broadcast + targeted). Defaults to last hour.
 * @param {any} sql - DO SQL handle
 * @param {string} resolvedAgentId
 * @param {string | null} since - ISO datetime cutoff, or null for last hour
 * @returns {{ messages: import('../../types.js').AgentMessage[] }}
 */
export function getMessages(sql, resolvedAgentId, since) {
  const messages = sql
    .exec(
      `SELECT id, agent_id, handle, host_tool, agent_surface, target_agent, text, created_at
     FROM messages
     WHERE created_at > COALESCE(?, datetime('now', '-1 hour'))
       AND (target_agent IS NULL OR target_agent = ?)
     ORDER BY created_at DESC
     LIMIT 50`,
      since || null,
      resolvedAgentId,
    )
    .toArray();

  return { messages };
}
