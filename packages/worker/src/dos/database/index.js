// Database Durable Object — single instance holding all persistent data in SQLite.
// Uses DO RPC for direct method calls from the Worker.
// Users have UUID primary keys; handles are display names with a unique index.
//
// Submodules:
//   evaluations.js — tool directory CRUD (largest separate domain)

import { DurableObject } from 'cloudflare:workers';
import { seedEvaluations } from '../../lib/seed-evaluations.js';
import { toSQLDateTime } from '../../lib/text-utils.js';
import { WEB_SESSION_DURATION_MS } from '../../lib/constants.js';
import { runMigration } from '../../lib/migrate.js';
import {
  saveEvaluation as saveEvalFn,
  getEvaluation as getEvalFn,
  listEvaluations as listEvalsFn,
  searchEvaluations as searchEvalsFn,
  deleteEvaluation as deleteEvalFn,
  hasEvaluations as hasEvalsFn,
} from './evaluations.js';

const COLORS = [
  'red', 'cyan', 'yellow', 'green', 'magenta', 'blue',
  'orange', 'lime', 'pink', 'sky', 'lavender', 'white',
];

const ADJECTIVES = [
  'swift', 'quiet', 'bold', 'keen', 'warm', 'cool', 'fair', 'deep',
  'bright', 'calm', 'dark', 'fast', 'glad', 'kind', 'live', 'neat',
  'pale', 'rare', 'safe', 'tall', 'vast', 'wise', 'zany', 'apt',
  'dry', 'fit', 'raw', 'shy', 'wry', 'odd', 'sly', 'coy',
  'deft', 'grim', 'hazy', 'icy', 'lazy', 'mild', 'nimble', 'plush',
  'rosy', 'snug', 'tidy', 'ultra', 'vivid', 'witty', 'airy', 'bumpy',
  'crisp', 'dizzy', 'eager', 'fuzzy', 'grumpy', 'hasty', 'itchy', 'jolly',
  'lumpy', 'merry', 'nifty', 'perky', 'quirky', 'rusty', 'shiny', 'tricky',
];

const NOUNS = [
  'fox', 'owl', 'elk', 'yak', 'ant', 'bee', 'cod', 'doe',
  'eel', 'gnu', 'hen', 'jay', 'kit', 'lynx', 'moth', 'newt',
  'pug', 'ram', 'seal', 'toad', 'vole', 'wasp', 'wren', 'crab',
  'crow', 'dart', 'echo', 'fern', 'glow', 'haze', 'iris', 'jade',
  'kelp', 'lark', 'mist', 'node', 'opal', 'pine', 'reed', 'sage',
  'tide', 'vine', 'wolf', 'pixel', 'spark', 'cloud', 'flint', 'brook',
  'crane', 'drift', 'flame', 'ghost', 'haven', 'ivory', 'jewel', 'knoll',
  'maple', 'nexus', 'orbit', 'prism', 'quartz', 'ridge', 'storm', 'thorn',
];

export class DatabaseDO extends DurableObject {
  #schemaReady = false;
  #evaluationsSeeded = false;

  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }

  #ensureSchema() {
    if (this.#schemaReady) return;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        color TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        status TEXT,
        created_at TEXT NOT NULL,
        last_active TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS account_limits (
        ip TEXT NOT NULL,
        date TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (ip, date)
      );

      CREATE TABLE IF NOT EXISTS agent_profiles (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        framework TEXT,
        languages TEXT,
        frameworks TEXT,
        tools TEXT,
        platforms TEXT,
        registered_at TEXT DEFAULT (datetime('now')),
        last_active TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_teams (
        user_id TEXT NOT NULL REFERENCES users(id),
        team_id TEXT NOT NULL,
        team_name TEXT,
        joined_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, team_id)
      );

      CREATE TABLE IF NOT EXISTS tool_evaluations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tagline TEXT,
        category TEXT,
        mcp_support INTEGER,
        has_cli INTEGER,
        hooks_support INTEGER,
        channel_support INTEGER,
        process_detectable INTEGER,
        open_source INTEGER,
        verdict TEXT NOT NULL,
        integration_tier TEXT,
        blocking_issues TEXT DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        sources TEXT NOT NULL DEFAULT '[]',
        in_registry INTEGER DEFAULT 0,
        evaluated_at TEXT NOT NULL,
        confidence TEXT NOT NULL DEFAULT 'medium',
        evaluated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_eval_category ON tool_evaluations(category);
      CREATE INDEX IF NOT EXISTS idx_eval_verdict ON tool_evaluations(verdict);

      CREATE TABLE IF NOT EXISTS web_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        last_used TEXT DEFAULT (datetime('now')),
        user_agent TEXT,
        revoked INTEGER DEFAULT 0
      );
    `);

    // Migrate: add team_name column for tables created before this column existed
    runMigration(this.sql, 'ALTER TABLE user_teams ADD COLUMN team_name TEXT', null, 'DatabaseDO');

    // Migrate: add GitHub OAuth columns
    runMigration(this.sql, 'ALTER TABLE users ADD COLUMN github_id TEXT', null, 'DatabaseDO');
    runMigration(this.sql, 'ALTER TABLE users ADD COLUMN github_login TEXT', null, 'DatabaseDO');
    runMigration(this.sql, 'ALTER TABLE users ADD COLUMN avatar_url TEXT', null, 'DatabaseDO');
    runMigration(this.sql, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id)', null, 'DatabaseDO');

    // Prune stale rate limit rows and expired sessions
    this.sql.exec("DELETE FROM account_limits WHERE date < date('now', '-7 days')");
    this.sql.exec("DELETE FROM web_sessions WHERE expires_at < datetime('now') OR revoked = 1");

    this.#schemaReady = true;
  }

  // ── Users ──

  /**
   * Create a new user with a random handle, color, and auth token.
   * @returns {Promise<import('../../types.js').NewUser | import('../../types.js').DOError>}
   */
  async createUser() {
    this.#ensureSchema();

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const now = toSQLDateTime();

    let handle = this.#generateHandle();
    let attempts = 0;
    while (this.#handleExists(handle) && attempts < 10) {
      handle = this.#generateHandle() + Math.floor(Math.random() * 100);
      attempts++;
    }

    if (this.#handleExists(handle)) {
      return { error: 'Could not generate unique handle, please try again' };
    }

    this.sql.exec(
      `INSERT INTO users (id, handle, color, token, status, created_at, last_active)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      id, handle, color, token, now, now
    );

    return { id, handle, color, token };
  }

  /**
   * Get a user by ID. Updates last_active if stale (>5 min).
   * @param {string} id
   * @returns {Promise<import('../../types.js').User | null>}
   */
  async getUser(id) {
    this.#ensureSchema();
    const rows = this.sql.exec(
      'SELECT id, handle, color, status, github_id, github_login, avatar_url, created_at, last_active FROM users WHERE id = ?', id
    ).toArray();
    const user = rows[0] || null;
    if (user) {
      const lastActive = new Date(user.last_active).getTime();
      if (Date.now() - lastActive > 300_000) {
        this.sql.exec("UPDATE users SET last_active = datetime('now') WHERE id = ?", id);
      }
    }
    return user;
  }

  /**
   * Look up a user by their handle.
   * @param {string} handle
   * @returns {Promise<import('../../types.js').User | null>}
   */
  async getUserByHandle(handle) {
    this.#ensureSchema();
    const rows = this.sql.exec(
      'SELECT id, handle, color, status, created_at, last_active FROM users WHERE handle = ?', handle
    ).toArray();
    return rows[0] || null;
  }

  /**
   * Change a user's handle. Must be 3-20 chars, alphanumeric + underscores, and unique.
   * @param {string} userId
   * @param {string} newHandle
   * @returns {Promise<{ ok: boolean, handle: string } | import('../../types.js').DOError>}
   */
  async updateHandle(userId, newHandle) {
    this.#ensureSchema();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(newHandle)) {
      return { error: 'Handle must be 3-20 characters, alphanumeric + underscores only' };
    }

    const taken = this.sql.exec(
      'SELECT 1 FROM users WHERE handle = ? AND id != ?', newHandle, userId
    ).toArray().length > 0;
    if (taken) {
      return { error: 'Handle already taken' };
    }

    this.sql.exec('UPDATE users SET handle = ? WHERE id = ?', newHandle, userId);
    return { ok: true, handle: newHandle };
  }

  /**
   * Change a user's display color. Must be one of the 12 allowed colors.
   * @param {string} userId
   * @param {string} color
   * @returns {Promise<{ ok: boolean, color: string } | import('../../types.js').DOError>}
   */
  async updateColor(userId, color) {
    this.#ensureSchema();

    if (!COLORS.includes(color)) {
      return { error: `Color must be one of: ${COLORS.join(', ')}` };
    }

    this.sql.exec('UPDATE users SET color = ? WHERE id = ?', color, userId);
    return { ok: true, color };
  }

  /**
   * Set or clear a user's status text.
   * @param {string} userId
   * @param {string | null} status
   * @returns {Promise<import('../../types.js').DOResult>}
   */
  async setStatus(userId, status) {
    this.#ensureSchema();
    this.sql.exec('UPDATE users SET status = ? WHERE id = ?', status, userId);
    return { ok: true };
  }

  // ── GitHub OAuth ──

  /**
   * Look up a user by their linked GitHub ID.
   * @param {string | number} githubId
   * @returns {Promise<import('../../types.js').User | null>}
   */
  async getUserByGithubId(githubId) {
    this.#ensureSchema();
    const rows = this.sql.exec(
      'SELECT id, handle, color, status, github_id, github_login, avatar_url, created_at, last_active FROM users WHERE github_id = ?',
      String(githubId)
    ).toArray();
    return rows[0] || null;
  }

  /**
   * Create a new user from GitHub OAuth data.
   * @param {string | number} githubId
   * @param {string} githubLogin
   * @param {string | null} avatarUrl
   * @returns {Promise<import('../../types.js').NewUser | import('../../types.js').DOError>}
   */
  async createUserFromGithub(githubId, githubLogin, avatarUrl) {
    this.#ensureSchema();

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const now = toSQLDateTime();

    let handle = githubLogin.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20);
    if (handle.length < 3) handle = this.#generateHandle();
    let attempts = 0;
    while (this.#handleExists(handle) && attempts < 10) {
      handle = this.#generateHandle() + Math.floor(Math.random() * 100);
      attempts++;
    }
    if (this.#handleExists(handle)) {
      return { error: 'Could not generate unique handle' };
    }

    this.sql.exec(
      `INSERT INTO users (id, handle, color, token, status, github_id, github_login, avatar_url, created_at, last_active)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      id, handle, color, token, String(githubId), githubLogin, avatarUrl || null, now, now
    );

    return { id, handle, color, token };
  }

  /**
   * Link a GitHub account to an existing user.
   * @param {string} userId
   * @param {string | number} githubId
   * @param {string} githubLogin
   * @param {string | null} avatarUrl
   * @returns {Promise<import('../../types.js').DOResult>}
   */
  async linkGithub(userId, githubId, githubLogin, avatarUrl) {
    this.#ensureSchema();

    const existing = this.sql.exec(
      'SELECT id FROM users WHERE github_id = ? AND id != ?', String(githubId), userId
    ).toArray();
    if (existing.length > 0) {
      return { error: 'This GitHub account is already linked to another user' };
    }

    this.sql.exec(
      'UPDATE users SET github_id = ?, github_login = ?, avatar_url = ? WHERE id = ?',
      String(githubId), githubLogin, avatarUrl || null, userId
    );
    return { ok: true };
  }

  /**
   * Remove GitHub link from a user.
   * @param {string} userId
   * @returns {Promise<import('../../types.js').DOResult>}
   */
  async unlinkGithub(userId) {
    this.#ensureSchema();
    this.sql.exec(
      'UPDATE users SET github_id = NULL, github_login = NULL, avatar_url = NULL WHERE id = ?',
      userId
    );
    return { ok: true };
  }

  // ── Web sessions ──

  /**
   * Create a web session token for browser-based auth.
   * @param {string} userId
   * @param {string | null} userAgent
   * @returns {Promise<{ token: string, expires_at: string }>}
   */
  async createWebSession(userId, userAgent) {
    this.#ensureSchema();
    const token = crypto.randomUUID();
    const expiresAt = toSQLDateTime(new Date(Date.now() + WEB_SESSION_DURATION_MS));

    this.sql.exec(
      `INSERT INTO web_sessions (token, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)`,
      token, userId, expiresAt, userAgent || null
    );
    return { token, expires_at: expiresAt };
  }

  /**
   * Get and refresh a valid web session. Returns null if expired or revoked.
   * @param {string} token
   * @returns {Promise<import('../../types.js').WebSession | null>}
   */
  async getWebSession(token) {
    this.#ensureSchema();
    const rows = this.sql.exec(
      `SELECT token, user_id, expires_at, last_used, user_agent, revoked
       FROM web_sessions
       WHERE token = ? AND revoked = 0 AND expires_at > datetime('now')`,
      token
    ).toArray();
    if (rows.length === 0) return null;

    // Slide the window — refresh expiry and last_used on access
    this.sql.exec(
      `UPDATE web_sessions SET last_used = datetime('now') WHERE token = ?`,
      token
    );
    return rows[0];
  }

  /**
   * Revoke a web session.
   * @param {string} token
   * @returns {Promise<import('../../types.js').DOResult>}
   */
  async revokeWebSession(token) {
    this.#ensureSchema();
    this.sql.exec('UPDATE web_sessions SET revoked = 1 WHERE token = ?', token);
    return { ok: true };
  }

  /**
   * List active web sessions for a user (up to 20).
   * @param {string} userId
   * @returns {Promise<Array<{ token: string, created_at: string, expires_at: string, last_used: string, user_agent: string | null }>>}
   */
  async getUserWebSessions(userId) {
    this.#ensureSchema();
    return this.sql.exec(
      `SELECT token, created_at, expires_at, last_used, user_agent
       FROM web_sessions
       WHERE user_id = ? AND revoked = 0 AND expires_at > datetime('now')
       ORDER BY last_used DESC LIMIT 20`,
      userId
    ).toArray();
  }

  // ── Rate limiting ──

  /**
   * Check if a rate limit key has remaining capacity for today.
   * @param {string} key - Rate limit key (e.g. "join:userId", "memory:userId")
   * @param {number} [maxPerDay=3]
   * @returns {Promise<import('../../types.js').RateLimitCheck>}
   */
  async checkRateLimit(key, maxPerDay = 3) {
    this.#ensureSchema();
    const today = utcDate();

    const rows = this.sql.exec(
      'SELECT count FROM account_limits WHERE ip = ? AND date = ?', key, today
    ).toArray();

    const count = rows[0]?.count || 0;
    return { allowed: count < maxPerDay, count };
  }

  /**
   * Increment the rate limit counter for today.
   * @param {string} key
   */
  async consumeRateLimit(key) {
    this.#ensureSchema();
    const today = utcDate();

    this.sql.exec(
      `INSERT INTO account_limits (ip, date, count) VALUES (?, ?, 1)
       ON CONFLICT(ip, date) DO UPDATE SET count = count + 1`,
      key, today
    );
  }

  // ── Stats ──

  async getStats() {
    this.#ensureSchema();
    const users = this.sql.exec('SELECT COUNT(*) as count FROM users').toArray();
    return { totalUsers: users[0]?.count || 0 };
  }

  // ── Tool evaluations (logic in evaluations.js) ──

  async #ensureEvaluationsSeeded() {
    if (this.#evaluationsSeeded) return;
    this.#ensureSchema();
    const { count } = hasEvalsFn(this.sql);
    if (count === 0) {
      await seedEvaluations(this);
    }
    this.#evaluationsSeeded = true;
  }

  async saveEvaluation(evaluation) {
    this.#ensureSchema();
    return saveEvalFn(this.sql, evaluation);
  }

  async getEvaluation(toolId) {
    await this.#ensureEvaluationsSeeded();
    return getEvalFn(this.sql, toolId);
  }

  async listEvaluations(filters = {}) {
    await this.#ensureEvaluationsSeeded();
    return listEvalsFn(this.sql, filters);
  }

  async searchEvaluations(query, limit = 20) {
    await this.#ensureEvaluationsSeeded();
    return searchEvalsFn(this.sql, query, limit);
  }

  async deleteEvaluation(toolId) {
    this.#ensureSchema();
    return deleteEvalFn(this.sql, toolId);
  }

  async hasEvaluations() {
    this.#ensureSchema();
    return hasEvalsFn(this.sql);
  }

  // ── User teams ──

  /**
   * Record that a user belongs to a team.
   * @param {string} userId
   * @param {string} teamId
   * @param {string | null} [name=null] - Optional team display name
   * @returns {Promise<import('../../types.js').DOResult>}
   */
  async addUserTeam(userId, teamId, name = null) {
    this.#ensureSchema();
    this.sql.exec(
      `INSERT INTO user_teams (user_id, team_id, team_name) VALUES (?, ?, ?)
       ON CONFLICT(user_id, team_id) DO UPDATE SET
         team_name = COALESCE(excluded.team_name, user_teams.team_name)`,
      userId, teamId, name
    );
    return { ok: true };
  }

  /**
   * Get all teams a user belongs to (up to 50).
   * @param {string} userId
   * @returns {Promise<import('../../types.js').UserTeam[]>}
   */
  async getUserTeams(userId) {
    this.#ensureSchema();
    return this.sql.exec(
      'SELECT team_id, team_name, joined_at FROM user_teams WHERE user_id = ? ORDER BY joined_at DESC LIMIT 50',
      userId
    ).toArray();
  }

  /**
   * Remove a team membership record.
   * @param {string} userId
   * @param {string} teamId
   * @returns {Promise<import('../../types.js').DOResult>}
   */
  async removeUserTeam(userId, teamId) {
    this.#ensureSchema();
    this.sql.exec('DELETE FROM user_teams WHERE user_id = ? AND team_id = ?', userId, teamId);
    return { ok: true };
  }

  // ── Agent profiles ──

  /**
   * Upsert agent profile data (framework, languages, etc.).
   * @param {string} userId
   * @param {import('../../types.js').AgentProfile} profile
   * @returns {Promise<import('../../types.js').DOResult>}
   */
  async updateAgentProfile(userId, profile) {
    this.#ensureSchema();
    const user = this.sql.exec('SELECT id FROM users WHERE id = ?', userId).toArray();
    if (user.length === 0) return { error: 'User not found' };

    this.sql.exec(
      `INSERT INTO agent_profiles (user_id, framework, languages, frameworks, tools, platforms, registered_at, last_active)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         framework = excluded.framework,
         languages = excluded.languages,
         frameworks = excluded.frameworks,
         tools = excluded.tools,
         platforms = excluded.platforms,
         last_active = datetime('now')`,
      userId,
      profile.framework || null,
      JSON.stringify(profile.languages || []),
      JSON.stringify(profile.frameworks || []),
      JSON.stringify(profile.tools || []),
      JSON.stringify(profile.platforms || [])
    );

    return { ok: true };
  }

  // ── Private helpers ──

  #generateHandle() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return adj + noun;
  }

  #handleExists(handle) {
    return this.sql.exec('SELECT 1 FROM users WHERE handle = ?', handle).toArray().length > 0;
  }
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}
