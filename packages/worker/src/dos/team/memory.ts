// Shared project memory -- saveMemory, searchMemories, updateMemory, deleteMemory.
// Each function takes `sql` as the first parameter.

import type { DOResult, Memory } from '../../types.js';
import { createLogger } from '../../lib/logger.js';
import { safeParse } from '../../lib/safe-parse.js';
import { normalizeRuntimeMetadata } from './runtime.js';
import {
  MEMORY_MAX_COUNT,
  LAST_ACCESSED_THROTTLE_MS,
  METRIC_KEYS,
  MEMORY_DECAY_HALFLIFE_DAYS,
  MEMORY_DECAY_HALFLIFE_LONG_DAYS,
  MEMORY_DECAY_HALFLIFE_SHORT_DAYS,
  MEMORY_DECAY_TAGS_LONG,
  MEMORY_DECAY_TAGS_SHORT,
  MEMORY_DECAY_CANDIDATE_MULTIPLIER,
} from '../../lib/constants.js';
import { sqlChanges, withTransaction } from '../../lib/validation.js';
import { recordTagUsage } from './categories.js';

const log = createLogger('TeamDO.memory');

// Escape LIKE wildcards so user-supplied text is matched literally
function escapeLike(s: string): string {
  return s.replace(/[%_]/g, (ch) => `\\${ch}`);
}

interface SaveMemoryResult {
  ok: true;
  id: string;
  evicted?: number;
}

interface DuplicateResult {
  error: string;
  code: 'DUPLICATE';
  existingId: string;
  existingText: string;
  similarity?: number;
}

/** Cosine similarity between two Float32Arrays. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    // Loop bound is a.length, so a[i] is always defined; b is asserted to match (caller contract).
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const NEAR_DEDUP_THRESHOLD = 0.93;

export function saveMemory(
  sql: SqlStorage,
  resolvedAgentId: string,
  text: string,
  tags: string[] | null | undefined,
  categories: string[] | null | undefined,
  handle: string,
  runtimeOrTool: string | Record<string, unknown> | null | undefined,
  recordMetric: (metric: string) => void,
  transact: <T>(fn: () => T) => T,
  textHash: string | null = null,
  embedding: ArrayBuffer | null = null,
): DOResult<SaveMemoryResult> | DuplicateResult {
  const runtime = normalizeRuntimeMetadata(runtimeOrTool, resolvedAgentId);

  // --- Exact dedup: hash lookup ---
  if (textHash) {
    const existing = sql
      .exec('SELECT id, text FROM memories WHERE text_hash = ?', textHash)
      .toArray();
    if (existing.length > 0) {
      const row = existing[0] as Record<string, unknown>;
      return {
        error: 'Duplicate memory exists',
        code: 'DUPLICATE',
        existingId: row.id as string,
        existingText: row.text as string,
      };
    }
  }

  // --- Near dedup: embedding similarity scan ---
  if (embedding) {
    const queryVec = new Float32Array(embedding);
    const rows = sql
      .exec('SELECT id, text, embedding FROM memories WHERE embedding IS NOT NULL')
      .toArray();

    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const storedBuf = r.embedding as ArrayBuffer;
      if (!storedBuf) continue;
      const storedVec = new Float32Array(storedBuf);
      const sim = cosineSimilarity(queryVec, storedVec);
      if (sim >= NEAR_DEDUP_THRESHOLD) {
        return {
          error: 'Near-duplicate memory exists',
          code: 'DUPLICATE',
          existingId: r.id as string,
          existingText: r.text as string,
          similarity: Math.round(sim * 1000) / 1000,
        };
      }
    }
  }

  // Inherit model + session_id from active session
  const sessionRow = sql
    .exec(
      'SELECT id, agent_model FROM sessions WHERE agent_id = ? AND ended_at IS NULL LIMIT 1',
      resolvedAgentId,
    )
    .toArray();
  const sessionData = sessionRow[0] as Record<string, unknown> | undefined;
  const model = (sessionData?.agent_model as string) || runtime.model || null;
  const sessionId = (sessionData?.id as string) || null;

  const id = crypto.randomUUID();
  const normalizedTags = tags || [];
  const normalizedCategories = categories || [];

  // Transaction ensures insert + pruning + tag stats + session update are atomic.
  let evicted = 0;
  withTransaction(transact, () => {
    sql.exec(
      `INSERT INTO memories (id, text, tags, categories, agent_id, handle, host_tool, agent_surface, agent_model, session_id, text_hash, embedding, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      id,
      text,
      JSON.stringify(normalizedTags),
      JSON.stringify(normalizedCategories),
      resolvedAgentId,
      handle || 'unknown',
      runtime.hostTool,
      runtime.agentSurface,
      model,
      sessionId,
      textHash,
      embedding,
    );

    // Prune oldest beyond storage cap (decay-aware: prefer evicting unaccessed memories)
    sql.exec(
      `DELETE FROM memories WHERE id NOT IN (
        SELECT id FROM memories ORDER BY
          COALESCE(last_accessed_at, '1970-01-01') DESC,
          updated_at DESC,
          created_at DESC
        LIMIT ?
      )`,
      MEMORY_MAX_COUNT,
    );
    evicted = sqlChanges(sql);

    // Track tag usage for promotion suggestions
    if (normalizedTags.length > 0) {
      recordTagUsage(sql, normalizedTags);
    }

    // Record in active session
    sql.exec(
      `UPDATE sessions SET memories_saved = memories_saved + 1
       WHERE agent_id = ? AND ended_at IS NULL`,
      resolvedAgentId,
    );
  });
  recordMetric(METRIC_KEYS.MEMORIES_SAVED);

  const result: SaveMemoryResult = { ok: true, id };
  if (evicted > 0) result.evicted = evicted;
  return result;
}

interface SearchMemoriesResult {
  ok: true;
  memories: Memory[] | CompactMemory[];
  format?: 'detail' | 'compact';
}

export interface SearchFilters {
  query?: string | null;
  tags?: string[] | null;
  categories?: string[] | null;
  sessionId?: string | null;
  agentId?: string | null;
  handle?: string | null;
  after?: string | null;
  before?: string | null;
  limit?: number;
  /**
   * Decay-aware ranking. 'on' (default) multiplies relevance by an
   * exponential decay factor based on age and a log-scale access boost,
   * with halflife determined by tags (long for decision/adr/architecture,
   * short for scratch/debug/wip). 'off' falls back to recency-only ordering
   * for "show me everything" queries.
   */
  decay?: 'on' | 'off';
  /**
   * Response shape. 'detail' (default) returns the full Memory object.
   * 'compact' returns {id, tags, preview, updated_at} for token-budgeted
   * use cases — agents can scan the result list without loading every full
   * text, then call back for detail on hits worth investigating.
   */
  format?: 'detail' | 'compact';
}

export interface CompactMemory {
  id: string;
  tags: string[];
  preview: string;
  updated_at: string;
}

/**
 * Heuristic preview for compact mode: prefer first sentence (split on .!?),
 * cap at 160 chars at a word boundary, ellipsis if truncated. Captures
 * enough signal for an agent to decide whether to fetch detail without
 * doubling round-trips on every hit.
 */
function buildPreview(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const PREVIEW_MAX = 160;
  if (trimmed.length <= PREVIEW_MAX) return trimmed;

  // Try first sentence — most chinwag memories lead with a one-line summary
  const sentenceMatch = trimmed.match(/^[^.!?]{20,200}[.!?]/);
  if (sentenceMatch && sentenceMatch[0].length <= PREVIEW_MAX) {
    return sentenceMatch[0].trim();
  }

  // Fall back to word-boundary truncation
  const slice = trimmed.slice(0, PREVIEW_MAX);
  const lastSpace = slice.lastIndexOf(' ');
  const cutoff = lastSpace > PREVIEW_MAX * 0.6 ? lastSpace : PREVIEW_MAX;
  return `${trimmed.slice(0, cutoff)}…`;
}

/**
 * Pick the appropriate decay halflife in days based on memory tags.
 * Tag conventions are agent-author authority; we read the tags they already
 * apply rather than introducing a new "memory type" concept.
 */
function halflifeForTags(tags: string[]): number {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (MEMORY_DECAY_TAGS_LONG.includes(lower)) return MEMORY_DECAY_HALFLIFE_LONG_DAYS;
  }
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (MEMORY_DECAY_TAGS_SHORT.includes(lower)) return MEMORY_DECAY_HALFLIFE_SHORT_DAYS;
  }
  return MEMORY_DECAY_HALFLIFE_DAYS;
}

/**
 * Compute the decay-aware score for a memory.
 *   score = exp(-age_days / halflife) * (1 + log(1 + access_count))
 * The access boost rescues old-but-frequently-used memories (chinwag's
 * answer to the "we use pnpm" stable-fact starvation case). Multiplier
 * with the existing relevance signal is left to the caller.
 */
function decayScore(createdAt: string, accessCount: number, tags: string[]): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = Math.max(0, ageMs / 86_400_000);
  const halflife = halflifeForTags(tags);
  const decay = Math.exp(-ageDays / halflife);
  const accessBoost = 1 + Math.log(1 + Math.max(0, accessCount));
  return decay * accessBoost;
}

export function searchMemories(sql: SqlStorage, filters: SearchFilters): SearchMemoriesResult {
  const { query, tags, categories, sessionId, agentId, handle, after, before } = filters;
  const cappedLimit = Math.min(Math.max(1, filters.limit || 20), 50);
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Use FTS5 for text queries (BM25 ranked, prefix-aware).
  // Falls back to LIKE if FTS5 query fails (e.g., special characters).
  let _useFts = false;
  if (query) {
    try {
      // Sanitize query for FTS5: escape quotes, add prefix matching
      const ftsQuery = query
        .replace(/"/g, '""')
        .split(/\s+/)
        .filter(Boolean)
        .map((term) => `"${term}"*`)
        .join(' ');
      // Test that the FTS5 table exists and query is valid
      sql.exec('SELECT 1 FROM memories_fts LIMIT 0');
      conditions.push('m.rowid IN (SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?)');
      params.push(ftsQuery);
      _useFts = true;
    } catch {
      // FTS5 not available or query invalid — fall back to LIKE
      conditions.push("text LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(query)}%`);
    }
  }
  if (tags && tags.length > 0) {
    const tagClauses = tags.map(() => "tags LIKE ? ESCAPE '\\'");
    conditions.push(`(${tagClauses.join(' OR ')})`);
    for (const tag of tags) params.push(`%"${escapeLike(tag)}"%`);
  }
  if (categories && categories.length > 0) {
    const catClauses = categories.map(() => "categories LIKE ? ESCAPE '\\'");
    conditions.push(`(${catClauses.join(' OR ')})`);
    for (const cat of categories) params.push(`%"${escapeLike(cat)}"%`);
  }
  if (sessionId) {
    conditions.push('session_id = ?');
    params.push(sessionId);
  }
  if (agentId) {
    conditions.push('agent_id = ?');
    params.push(agentId);
  }
  if (handle) {
    conditions.push('handle = ?');
    params.push(handle);
  }
  if (after) {
    conditions.push('created_at > ?');
    params.push(after);
  }
  if (before) {
    conditions.push('created_at < ?');
    params.push(before);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  // is_stale is computed in SQL so the throttle decision stays in SQLite's
  // time domain — no JS Date parsing of SQLite datetime strings.
  const throttleSeconds = Math.round(LAST_ACCESSED_THROTTLE_MS / 1000);

  // Decay-aware ranking: when enabled, fetch a wider candidate pool from SQL
  // (ordered by FTS rank or recency) and re-sort in JS by `position_signal *
  // decay_score`. This combines text relevance / recency with tag-aware
  // exponential decay and a log-scale access boost. `decay: 'off'` falls back
  // to pure recency for "show me everything" queries.
  const decayEnabled = filters.decay !== 'off';
  const fetchLimit = decayEnabled ? cappedLimit * MEMORY_DECAY_CANDIDATE_MULTIPLIER : cappedLimit;
  const sqlStr = `SELECT m.id, m.text, m.tags, m.categories, m.handle, m.host_tool, m.agent_surface, m.agent_model, m.session_id, m.created_at, m.updated_at, m.last_accessed_at, m.access_count,
                   CASE
                     WHEN m.last_accessed_at IS NULL THEN 1
                     WHEN (julianday('now') - julianday(m.last_accessed_at)) * 86400 > ? THEN 1
                     ELSE 0
                   END AS is_stale
               FROM memories m ${where}
               ORDER BY m.updated_at DESC, m.created_at DESC LIMIT ?`;
  params.unshift(throttleSeconds);
  params.push(fetchLimit);

  const rows = sql.exec(sqlStr, ...params).toArray();

  // Throttled last_accessed_at update — only touch rows flagged is_stale by SQL.
  // Writes cost 20x reads on DO SQLite, so we avoid updating on every search.
  const idsToTouch: string[] = [];
  type Scored = { memory: Memory; relevanceWeight: number; decayWeight: number };
  const scored: Scored[] = rows.map((m, idx) => {
    const row = m as Record<string, unknown>;
    const parsedTags = safeParse(
      (row.tags as string) || '[]',
      `searchMemories memory=${row.id} tags`,
      row.tags ? [String(row.tags)] : [],
      log,
    );
    const parsedCategories = safeParse(
      (row.categories as string) || '[]',
      `searchMemories memory=${row.id} categories`,
      [],
      log,
    );

    if (row.is_stale === 1) {
      idsToTouch.push(row.id as string);
    }

    // Strip the SQL-only is_stale + access_count columns from the returned
    // row so callers see the same Memory shape as before. access_count is
    // used internally for decay scoring but kept off the wire for now.
    const { is_stale: _is_stale, access_count, ...rest } = row;
    const memory = {
      ...rest,
      tags: parsedTags,
      categories: parsedCategories,
    } as unknown as Memory;

    // SQL ranks by recency, so position 0 = most recent. Reciprocal-rank
    // weight gives diminishing returns to deeper candidates.
    const relevanceWeight = 1 / (idx + 1);
    const decayWeight = decayEnabled
      ? decayScore(
          (row.created_at as string) ?? new Date().toISOString(),
          Number(access_count) || 0,
          parsedTags as string[],
        )
      : 1;
    return { memory, relevanceWeight, decayWeight };
  });

  let memories: Memory[];
  if (decayEnabled) {
    scored.sort((a, b) => b.relevanceWeight * b.decayWeight - a.relevanceWeight * a.decayWeight);
    memories = scored.slice(0, cappedLimit).map((s) => s.memory);
  } else {
    memories = scored.slice(0, cappedLimit).map((s) => s.memory);
  }

  // Compact format: shape down to {id, tags, preview, updated_at} for token-
  // budgeted callers. Only applied here so decay scoring still uses full text.
  if (filters.format === 'compact') {
    const compact: CompactMemory[] = memories.map((m) => ({
      id: m.id,
      tags: (m.tags as string[]) || [],
      preview: buildPreview(m.text),
      updated_at: m.updated_at,
    }));
    // Touch stale memories before returning the compact view (preserves
    // access tracking for later decay decisions).
    if (idsToTouch.length > 0) {
      const placeholders = idsToTouch.map(() => '?').join(',');
      try {
        sql.exec(
          `UPDATE memories SET last_accessed_at = datetime('now'), access_count = access_count + 1 WHERE id IN (${placeholders})`,
          ...idsToTouch,
        );
      } catch (e) {
        log.error('failed to update last_accessed_at (compact)', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { ok: true, memories: compact, format: 'compact' };
  }

  // Batch update last_accessed_at for stale entries
  if (idsToTouch.length > 0) {
    const placeholders = idsToTouch.map(() => '?').join(',');
    try {
      sql.exec(
        `UPDATE memories SET last_accessed_at = datetime('now'), access_count = access_count + 1 WHERE id IN (${placeholders})`,
        ...idsToTouch,
      );
    } catch (e) {
      // Non-critical — log and continue
      log.error('failed to update last_accessed_at', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { ok: true, memories };
}

export function updateMemory(
  sql: SqlStorage,
  _resolvedAgentId: string,
  memoryId: string,
  text: string | undefined,
  tags: string[] | undefined,
): DOResult<{ ok: true }> {
  const existing = sql.exec('SELECT id FROM memories WHERE id = ?', memoryId).toArray();
  if (existing.length === 0) return { error: 'Memory not found', code: 'NOT_FOUND' };

  // Any team member can update -- memories are team knowledge
  const sets: string[] = [];
  const params: unknown[] = [];
  if (text !== undefined) {
    sets.push('text = ?');
    params.push(typeof text === 'string' ? text.trim() : String(text));
  }
  if (tags !== undefined) {
    sets.push('tags = ?');
    params.push(JSON.stringify(tags));
  }
  sets.push("updated_at = datetime('now')");
  params.push(memoryId);

  sql.exec(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`, ...params);
  return { ok: true };
}

export function deleteMemory(sql: SqlStorage, memoryId: string): DOResult<{ ok: true }> {
  // Any team member can delete -- memories are team knowledge
  sql.exec('DELETE FROM memories WHERE id = ?', memoryId);
  if (sqlChanges(sql) === 0) return { error: 'Memory not found', code: 'NOT_FOUND' };
  return { ok: true };
}

export interface BatchDeleteFilter {
  ids?: string[];
  tags?: string[];
  before?: string;
}

export function deleteMemoriesBatch(
  sql: SqlStorage,
  filter: BatchDeleteFilter,
  transact: <T>(fn: () => T) => T,
): DOResult<{ ok: true; deleted: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.ids && filter.ids.length > 0) {
    const placeholders = filter.ids.map(() => '?').join(',');
    conditions.push(`id IN (${placeholders})`);
    params.push(...filter.ids);
  }
  if (filter.tags && filter.tags.length > 0) {
    const tagClauses = filter.tags.map(() => "tags LIKE ? ESCAPE '\\'");
    conditions.push(`(${tagClauses.join(' OR ')})`);
    for (const tag of filter.tags) params.push(`%"${escapeLike(tag)}"%`);
  }
  if (filter.before) {
    conditions.push('created_at < ?');
    params.push(filter.before);
  }

  if (conditions.length === 0) {
    return { error: 'At least one filter required (ids, tags, or before)', code: 'VALIDATION' };
  }

  let deleted = 0;
  withTransaction(transact, () => {
    sql.exec(`DELETE FROM memories WHERE ${conditions.join(' AND ')}`, ...params);
    deleted = sqlChanges(sql);
  });

  return { ok: true, deleted };
}
