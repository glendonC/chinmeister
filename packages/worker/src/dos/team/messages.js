// Ephemeral agent messages — sendMessage, getMessages.
// Messages auto-expire after 1 hour.
// Each function takes `sql` as the first parameter.

export function sendMessage(sql, resolvedAgentId, handle, tool, text, targetAgent, recordMetric) {
  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO messages (id, from_agent, from_handle, from_tool, target_agent, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    id, resolvedAgentId, handle || 'unknown', tool || 'unknown', targetAgent || null, text
  );
  recordMetric('messages_sent');
  return { ok: true, id };
}

export function getMessages(sql, resolvedAgentId, since) {
  const messages = sql.exec(
    `SELECT id, from_handle, from_tool, target_agent, text, created_at
     FROM messages
     WHERE created_at > COALESCE(?, datetime('now', '-1 hour'))
       AND (target_agent IS NULL OR target_agent = ?)
     ORDER BY created_at DESC
     LIMIT 50`,
    since || null, resolvedAgentId
  ).toArray();

  return { messages };
}
