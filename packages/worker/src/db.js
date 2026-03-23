// Database Durable Object — single instance holding all persistent data in SQLite.
// Uses DO RPC for direct method calls from the Worker.
// Users have UUID primary keys; handles are display names with a unique index.

import { DurableObject } from 'cloudflare:workers';

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

  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }

  #ensureSchema() {
    if (this.#schemaReady) return;

    // Check if old v1 schema exists (handle as PK, no id column)
    const cols = this.sql.exec('PRAGMA table_info(users)').toArray();
    const hasTable = cols.length > 0;
    const hasId = cols.some(c => c.name === 'id');

    if (hasTable && !hasId) {
      this.#migrateV1ToV2();
    }

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
    `);

    // Drop legacy tables if they exist (removed in product pivot)
    this.sql.exec('DROP TABLE IF EXISTS exchanges');
    this.sql.exec('DROP TABLE IF EXISTS notes');

    this.#schemaReady = true;
  }

  #migrateV1ToV2() {
    // Migrate from handle-as-PK to UUID-as-PK schema.
    const oldUsers = this.sql.exec('SELECT * FROM users').toArray();

    const handleToId = new Map();
    for (const u of oldUsers) {
      handleToId.set(u.handle, crypto.randomUUID());
    }

    // Drop all old tables
    this.sql.exec('DROP TABLE IF EXISTS exchanges');
    this.sql.exec('DROP TABLE IF EXISTS notes');
    this.sql.exec('DROP TABLE IF EXISTS users');
    this.sql.exec('DROP TABLE IF EXISTS account_limits');

    // Create users table with UUID PK
    this.sql.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        color TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        status TEXT,
        created_at TEXT NOT NULL,
        last_active TEXT NOT NULL
      );

      CREATE TABLE account_limits (
        ip TEXT NOT NULL,
        date TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (ip, date)
      );
    `);

    for (const u of oldUsers) {
      this.sql.exec(
        `INSERT INTO users (id, handle, color, token, status, created_at, last_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        handleToId.get(u.handle), u.handle, u.color, u.token, u.status, u.created_at, u.last_active
      );
    }
  }

  // --- User operations ---

  async createUser() {
    this.#ensureSchema();

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const now = new Date().toISOString();

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

  async getUser(id) {
    this.#ensureSchema();
    const rows = this.sql.exec(
      'SELECT id, handle, color, status, created_at, last_active FROM users WHERE id = ?', id
    ).toArray();
    return rows[0] || null;
  }

  async getUserByHandle(handle) {
    this.#ensureSchema();
    const rows = this.sql.exec(
      'SELECT id, handle, color, status, created_at, last_active FROM users WHERE handle = ?', handle
    ).toArray();
    return rows[0] || null;
  }

  async getUserByToken(token) {
    this.#ensureSchema();
    const rows = this.sql.exec(
      'SELECT id, handle, color, status, created_at, last_active FROM users WHERE token = ?', token
    ).toArray();
    return rows[0] || null;
  }

  async updateHandle(userId, newHandle) {
    this.#ensureSchema();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(newHandle)) {
      return { error: 'Handle must be 3-20 characters, alphanumeric + underscores only' };
    }

    if (this.#handleExists(newHandle)) {
      return { error: 'Handle already taken' };
    }

    // Single update — no cascade needed since notes/exchanges reference user ID
    this.sql.exec('UPDATE users SET handle = ? WHERE id = ?', newHandle, userId);
    return { ok: true, handle: newHandle };
  }

  async updateColor(userId, color) {
    this.#ensureSchema();

    if (!COLORS.includes(color)) {
      return { error: `Color must be one of: ${COLORS.join(', ')}` };
    }

    this.sql.exec('UPDATE users SET color = ? WHERE id = ?', color, userId);
    return { ok: true, color };
  }

  async setStatus(userId, status) {
    this.#ensureSchema();
    this.sql.exec('UPDATE users SET status = ? WHERE id = ?', status, userId);
    return { ok: true };
  }

  // --- Rate limiting ---

  async checkIpLimit(ip, maxPerDay = 3) {
    this.#ensureSchema();
    const today = utcDate();

    this.sql.exec(
      `INSERT INTO account_limits (ip, date, count) VALUES (?, ?, 1)
       ON CONFLICT(ip, date) DO UPDATE SET count = count + 1`,
      ip, today
    );

    const rows = this.sql.exec(
      'SELECT count FROM account_limits WHERE ip = ? AND date = ?', ip, today
    ).toArray();

    const count = rows[0]?.count || 0;
    return { allowed: count <= maxPerDay, count };
  }

  // --- Stats ---

  async getStats() {
    this.#ensureSchema();

    const users = this.sql.exec('SELECT COUNT(*) as count FROM users').toArray();

    return {
      totalUsers: users[0]?.count || 0,
    };
  }

  // --- Private helpers ---

  #generateHandle() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return adj + noun;
  }

  #handleExists(handle) {
    return this.sql.exec('SELECT 1 FROM users WHERE handle = ?', handle).toArray().length > 0;
  }

  // --- Agent profiles ---

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

  async getAgentProfile(userId) {
    this.#ensureSchema();
    const rows = this.sql.exec(
      'SELECT * FROM agent_profiles WHERE user_id = ?', userId
    ).toArray();

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      user_id: row.user_id,
      framework: row.framework,
      languages: JSON.parse(row.languages || '[]'),
      frameworks: JSON.parse(row.frameworks || '[]'),
      tools: JSON.parse(row.tools || '[]'),
      platforms: JSON.parse(row.platforms || '[]'),
      registered_at: row.registered_at,
      last_active: row.last_active,
    };
  }
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}
