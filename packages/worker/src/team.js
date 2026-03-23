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

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('gotcha', 'pattern', 'config', 'decision')),
        source_agent TEXT NOT NULL,
        source_handle TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        relevance_score REAL DEFAULT 1.0
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

    // Include memories in context
    const memories = this.sql.exec(
      `SELECT text, category, source_handle, created_at
       FROM memories
       WHERE relevance_score > 0.1
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 10`
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
      memories,
    };
  }

  async reportFile(agentId, filePath) {
    this.#ensureSchema();
    if (!this.#isMember(agentId)) return { error: 'Not a member of this team' };

    const normalized = normalizePath(filePath);

    // Get existing files and append
    const existing = this.sql.exec(
      'SELECT files FROM activities WHERE agent_id = ?', agentId
    ).toArray();

    let files = [];
    if (existing.length > 0 && existing[0].files) {
      files = JSON.parse(existing[0].files);
    }

    if (!files.includes(normalized)) {
      files.push(normalized);
      if (files.length > 50) files = files.slice(-50);
    }

    this.sql.exec(
      `INSERT INTO activities (agent_id, files, summary, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(agent_id) DO UPDATE SET
         files = excluded.files,
         updated_at = datetime('now')`,
      agentId, JSON.stringify(files), `Editing ${normalized}`
    );
    this.sql.exec("UPDATE members SET last_heartbeat = datetime('now') WHERE agent_id = ?", agentId);
    return { ok: true };
  }

  async saveMemory(agentId, text, category, handle) {
    this.#ensureSchema();
    if (!this.#isMember(agentId)) return { error: 'Not a member of this team' };

    // Deduplication: check for similar existing memory
    const normalized = text.trim().toLowerCase();
    const existing = this.sql.exec('SELECT id, text FROM memories').toArray();

    for (const mem of existing) {
      const existingNorm = mem.text.trim().toLowerCase();
      if (existingNorm.includes(normalized) || normalized.includes(existingNorm)) {
        const keepText = text.length >= mem.text.length ? text : mem.text;
        this.sql.exec(
          `UPDATE memories SET text = ?, relevance_score = 1.0, created_at = datetime('now') WHERE id = ?`,
          keepText, mem.id
        );
        return { ok: true, deduplicated: true };
      }
    }

    const id = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO memories (id, text, category, source_agent, source_handle, created_at, relevance_score)
       VALUES (?, ?, ?, ?, ?, datetime('now'), 1.0)`,
      id, text, category, agentId, handle || 'unknown'
    );

    // Prune: keep at most 100 memories
    this.sql.exec(`
      DELETE FROM memories WHERE id NOT IN (
        SELECT id FROM memories ORDER BY relevance_score DESC, created_at DESC LIMIT 100
      )
    `);

    return { ok: true, id };
  }

  async getMemories(agentId) {
    this.#ensureSchema();
    if (!this.#isMember(agentId)) return { error: 'Not a member of this team' };

    // Time-based decay: reduce relevance for old memories (0.1/day after 7 days)
    this.sql.exec(`
      UPDATE memories SET relevance_score = MAX(0.1,
        1.0 - (MAX(0, julianday('now') - julianday(created_at) - 7) * 0.1)
      )
    `);

    const memories = this.sql.exec(
      `SELECT id, text, category, source_handle, created_at, relevance_score
       FROM memories
       WHERE relevance_score > 0.1
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 20`
    ).toArray();

    return { memories };
  }
}

// Strip leading ./ and trailing /, collapse // — so "src/index.js" and "./src/index.js" match
function normalizePath(p) {
  return p.replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
}
