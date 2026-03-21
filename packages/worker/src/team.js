// Team Durable Object — one instance per team.
// Manages team membership, activity tracking, and file conflict detection.
// Used for Scenario 3: multi-agent coordination on shared repos.

import { DurableObject } from 'cloudflare:workers';

export class TeamDO extends DurableObject {
  #schemaReady = false;

  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }

  #ensureSchema() {
    if (this.#schemaReady) return;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS members (
        agent_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        owner_handle TEXT NOT NULL,
        joined_at TEXT DEFAULT (datetime('now')),
        last_heartbeat TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS activities (
        agent_id TEXT PRIMARY KEY,
        files TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.#schemaReady = true;
  }

  #isMember(agentId) {
    return this.sql.exec('SELECT 1 FROM members WHERE agent_id = ?', agentId).toArray().length > 0;
  }

  async join(agentId, ownerId, ownerHandle) {
    this.#ensureSchema();
    this.sql.exec(
      `INSERT INTO members (agent_id, owner_id, owner_handle, joined_at, last_heartbeat)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(agent_id) DO UPDATE SET
         owner_id = excluded.owner_id,
         owner_handle = excluded.owner_handle,
         last_heartbeat = datetime('now')`,
      agentId, ownerId, ownerHandle
    );
    return { ok: true };
  }

  async leave(agentId) {
    this.#ensureSchema();
    this.sql.exec('DELETE FROM activities WHERE agent_id = ?', agentId);
    this.sql.exec('DELETE FROM members WHERE agent_id = ?', agentId);
    return { ok: true };
  }

  async heartbeat(agentId) {
    this.#ensureSchema();
    // Single query: update and check row was affected
    this.sql.exec("UPDATE members SET last_heartbeat = datetime('now') WHERE agent_id = ?", agentId);
    const row = this.sql.exec('SELECT changes() as c').toArray();
    if (row[0].c === 0) return { error: 'Not a member of this team' };
    return { ok: true };
  }

  async updateActivity(agentId, files, summary) {
    this.#ensureSchema();
    if (!this.#isMember(agentId)) return { error: 'Not a member of this team' };

    // Normalize file paths before storing
    const normalized = files.map(normalizePath);

    this.sql.exec(
      `INSERT INTO activities (agent_id, files, summary, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(agent_id) DO UPDATE SET
         files = excluded.files,
         summary = excluded.summary,
         updated_at = datetime('now')`,
      agentId, JSON.stringify(normalized), summary
    );
    this.sql.exec("UPDATE members SET last_heartbeat = datetime('now') WHERE agent_id = ?", agentId);
    return { ok: true };
  }

  async checkConflicts(agentId, files) {
    this.#ensureSchema();
    if (!this.#isMember(agentId)) return { error: 'Not a member of this team' };

    // Use SQLite datetime arithmetic — no JS Date conversion
    const others = this.sql.exec(
      `SELECT m.agent_id, m.owner_handle, a.files, a.summary
       FROM members m
       LEFT JOIN activities a ON a.agent_id = m.agent_id
       WHERE m.agent_id != ? AND m.last_heartbeat > datetime('now', '-60 seconds')`,
      agentId
    ).toArray();

    // Normalize incoming paths for comparison
    const myFiles = new Set(files.map(normalizePath));
    const conflicts = [];

    for (const row of others) {
      if (!row.files) continue;
      const theirFiles = JSON.parse(row.files);
      const overlap = theirFiles.filter(f => myFiles.has(f));
      if (overlap.length > 0) {
        conflicts.push({
          owner_handle: row.owner_handle,
          files: overlap,
          summary: row.summary || '',
        });
      }
    }

    return { conflicts };
  }

  async getContext(agentId) {
    this.#ensureSchema();
    if (!this.#isMember(agentId)) return { error: 'Not a member of this team' };

    // Clean stale members (offline > 5 min) — use SQLite datetime, not JS
    this.sql.exec(`DELETE FROM activities WHERE agent_id IN (
      SELECT agent_id FROM members WHERE last_heartbeat < datetime('now', '-300 seconds')
    )`);
    this.sql.exec("DELETE FROM members WHERE last_heartbeat < datetime('now', '-300 seconds')");

    const members = this.sql.exec(
      `SELECT m.owner_handle, a.files, a.summary, a.updated_at,
              CASE WHEN m.last_heartbeat > datetime('now', '-60 seconds')
                THEN 'active' ELSE 'offline' END as status
       FROM members m
       LEFT JOIN activities a ON a.agent_id = m.agent_id`
    ).toArray();

    return {
      members: members.map(m => ({
        handle: m.owner_handle,
        status: m.status,
        activity: m.files ? {
          files: JSON.parse(m.files),
          summary: m.summary,
          updated_at: m.updated_at,
        } : null,
      })),
    };
  }
}

// Strip leading ./ and trailing /, collapse // — so "src/index.js" and "./src/index.js" match
function normalizePath(p) {
  return p.replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
}
