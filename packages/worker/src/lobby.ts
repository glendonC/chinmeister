// Lobby Durable Object -- tracks all chat rooms, assigns users to rooms,
// and tracks presence (who has the app open).
// Uses DO RPC for direct method calls.

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types.js';
import type { Migration } from './lib/migrator.js';
import {
  CHAT_MIN_ROOM_SIZE,
  CHAT_MAX_ROOM_SIZE,
  CHAT_TARGET_ROOM_SIZE,
  PRESENCE_TTL_MS,
} from './lib/constants.js';
import { runMigrations } from './lib/migrator.js';

interface RoomInfo {
  count: number;
  lastUpdate: number;
}

const lobbyMigrations: Migration[] = [
  {
    name: '001_initial_schema',
    up(sql) {
      sql.exec(`
        CREATE TABLE IF NOT EXISTS rooms (
          room_id TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          last_updated TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS presence (
          handle TEXT PRIMARY KEY,
          last_seen INTEGER NOT NULL
        );
      `);
    },
  },
  {
    name: '002_presence_country',
    up(sql) {
      sql.exec(`ALTER TABLE presence ADD COLUMN country TEXT`);
    },
  },
];

export class LobbyDO extends DurableObject<Env> {
  sql: SqlStorage;
  rooms: Map<string, RoomInfo>;
  presence: Map<string, { lastSeen: number; country: string | null }>;
  #schemaReady = false;
  #lastPresenceCleanup = 0;

  #transact: <T>(fn: () => T) => T;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.#transact = <T>(fn: () => T): T => ctx.storage.transactionSync(fn);
    // roomId -> { count, lastUpdate }
    this.rooms = new Map();
    // handle -> { lastSeen, country }
    this.presence = new Map();
  }

  #ensureSchema(): void {
    if (this.#schemaReady) return;

    runMigrations(this.sql, this.#transact, lobbyMigrations);

    // Hydrate in-memory Maps from SQLite
    for (const row of this.sql.exec('SELECT room_id, count, last_updated FROM rooms')) {
      const r = row as { room_id: string; count: number; last_updated: string };
      this.rooms.set(r.room_id, {
        count: r.count,
        lastUpdate: new Date(r.last_updated + 'Z').getTime(),
      });
    }

    for (const row of this.sql.exec('SELECT handle, last_seen, country FROM presence')) {
      const r = row as { handle: string; last_seen: number; country: string | null };
      this.presence.set(r.handle, { lastSeen: r.last_seen, country: r.country });
    }

    this.#schemaReady = true;
  }

  /** Evict stale presence entries -- at most once per PRESENCE_TTL_MS. */
  #maybeCleanupPresence(): void {
    const now = Date.now();
    if (now - this.#lastPresenceCleanup < PRESENCE_TTL_MS) return;
    this.#lastPresenceCleanup = now;

    const staleHandles: string[] = [];
    for (const [handle, entry] of this.presence) {
      if (now - entry.lastSeen > PRESENCE_TTL_MS) {
        this.presence.delete(handle);
        staleHandles.push(handle);
      }
    }
    if (staleHandles.length > 0) {
      const placeholders = staleHandles.map(() => '?').join(', ');
      this.sql.exec(`DELETE FROM presence WHERE handle IN (${placeholders})`, ...staleHandles);
    }
  }

  async heartbeat(handle: string, country?: string | null): Promise<{ ok: true }> {
    this.#ensureSchema();
    const now = Date.now();
    const cc = country || null;
    this.presence.set(handle, { lastSeen: now, country: cc });
    this.sql.exec(
      'INSERT INTO presence (handle, last_seen, country) VALUES (?, ?, ?) ON CONFLICT(handle) DO UPDATE SET last_seen = excluded.last_seen, country = excluded.country',
      handle,
      now,
      cc,
    );
    this.#maybeCleanupPresence();
    return { ok: true };
  }

  async assignRoom(handle: string, shuffle = false): Promise<{ ok: true; roomId: string }> {
    this.#ensureSchema();
    let bestRoom: string | null = null;
    let bestScore = Infinity;

    for (const [roomId, info] of this.rooms) {
      if (info.count >= CHAT_MAX_ROOM_SIZE) continue;
      if (shuffle && info.count < CHAT_MIN_ROOM_SIZE) continue;

      const score = Math.abs(info.count - CHAT_TARGET_ROOM_SIZE);
      if (score < bestScore) {
        bestScore = score;
        bestRoom = roomId;
      }
    }

    if (!bestRoom) {
      bestRoom = `room-${crypto.randomUUID().slice(0, 8)}`;
      this.rooms.set(bestRoom, { count: 0, lastUpdate: Date.now() });
      this.sql.exec('INSERT INTO rooms (room_id, count) VALUES (?, 0)', bestRoom);
    }

    return { ok: true, roomId: bestRoom };
  }

  async updateRoomCount(roomId: string, count: number): Promise<{ ok: true }> {
    this.#ensureSchema();
    if (count <= 0) {
      this.rooms.delete(roomId);
      this.sql.exec('DELETE FROM rooms WHERE room_id = ?', roomId);
    } else {
      this.rooms.set(roomId, { count, lastUpdate: Date.now() });
      this.sql.exec(
        "INSERT INTO rooms (room_id, count, last_updated) VALUES (?, ?, datetime('now')) ON CONFLICT(room_id) DO UPDATE SET count = excluded.count, last_updated = excluded.last_updated",
        roomId,
        count,
      );
    }
    return { ok: true };
  }

  async removeRoom(roomId: string): Promise<{ ok: true }> {
    this.#ensureSchema();
    this.rooms.delete(roomId);
    this.sql.exec('DELETE FROM rooms WHERE room_id = ?', roomId);
    return { ok: true };
  }

  async getStats(): Promise<{
    ok: true;
    online: number;
    chatUsers: number;
    activeRooms: number;
    countries: Record<string, number>;
  }> {
    this.#ensureSchema();
    this.#maybeCleanupPresence();

    let chatUsers = 0;
    let activeRooms = 0;
    for (const [, info] of this.rooms) {
      chatUsers += info.count;
      activeRooms++;
    }

    const countries: Record<string, number> = {};
    for (const [, entry] of this.presence) {
      const cc = entry.country || 'XX';
      countries[cc] = (countries[cc] || 0) + 1;
    }

    return { ok: true, online: this.presence.size, chatUsers, activeRooms, countries };
  }
}
