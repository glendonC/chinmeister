// Single-use WebSocket ticket store.
//
// Tickets back the short-lived `?ticket=` query-string credential used for
// browser-side WS upgrades (the WebSocket constructor cannot set Authorization
// headers). They are issued from /me/ws-ticket, redeemed once, and expire
// after WS_TICKET_TTL_SECONDS regardless of whether they were claimed.
//
// Storage lives in DatabaseDO so consumption is atomic: SQLite under the DO's
// single-writer lock cannot race a concurrent reader. KV's eventually
// consistent get-then-delete pattern leaves a TOCTOU window that this
// closes.

import { sqlChanges } from '../../lib/validation.js';

/** TTL applied at issue time; consume rejects anything older. */
export const WS_TICKET_TTL_SECONDS = 30;

export function issueWsTicket(sql: SqlStorage, ticket: string, userId: string): { ok: true } {
  // Best-effort prune of stale tickets on every issue keeps the table
  // bounded without a separate sweep job. Cheap: indexed by created_at via
  // the integer rowid path.
  sql.exec(
    `DELETE FROM ws_tickets WHERE created_at < datetime('now', '-' || ? || ' seconds')`,
    WS_TICKET_TTL_SECONDS,
  );
  sql.exec(
    `INSERT OR REPLACE INTO ws_tickets (ticket, user_id, created_at) VALUES (?, ?, datetime('now'))`,
    ticket,
    userId,
  );
  return { ok: true };
}

/**
 * Atomically consume a ticket. Returns the bound user_id or null if the
 * ticket is missing, expired, or already used. The single DELETE statement
 * runs inside the DO's single-writer transaction so two concurrent calls
 * cannot both succeed.
 */
export function consumeWsTicket(
  sql: SqlStorage,
  ticket: string,
): { ok: true; user_id: string | null } {
  const rows = sql
    .exec(
      `DELETE FROM ws_tickets
         WHERE ticket = ?
           AND created_at >= datetime('now', '-' || ? || ' seconds')
         RETURNING user_id`,
      ticket,
      WS_TICKET_TTL_SECONDS,
    )
    .toArray();
  if (rows.length === 0) {
    // Ticket may exist but be expired; ensure it's gone either way so a
    // late attempt cannot resurrect it via a clock skew window.
    sql.exec('DELETE FROM ws_tickets WHERE ticket = ?', ticket);
    sqlChanges(sql); // discard count
    return { ok: true, user_id: null };
  }
  const userId = (rows[0] as { user_id?: string }).user_id ?? null;
  return { ok: true, user_id: userId };
}
