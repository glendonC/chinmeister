// Memory analytics: usage stats, outcome correlation, top memories.

import { createLogger } from '../../../lib/logger.js';
import type {
  MemoryUsageStats,
  MemoryOutcomeCorrelation,
  MemoryAccessEntry,
} from '@chinwag/shared/contracts/analytics.js';

const log = createLogger('TeamDO.analytics');

export function queryMemoryUsage(sql: SqlStorage, days: number): MemoryUsageStats {
  try {
    // Total memories
    const totalRow = sql.exec('SELECT COUNT(*) AS cnt FROM memories').one() as Record<
      string,
      unknown
    >;
    const total = (totalRow?.cnt as number) || 0;

    // Memories created/updated in period
    const periodRow = sql
      .exec(
        `SELECT
           SUM(CASE WHEN created_at > datetime('now', '-' || ? || ' days') THEN 1 ELSE 0 END) AS created,
           SUM(CASE WHEN updated_at > datetime('now', '-' || ? || ' days')
                      AND updated_at != created_at THEN 1 ELSE 0 END) AS updated
         FROM memories`,
        days,
        days,
      )
      .one() as Record<string, unknown>;

    // Stale memories (not accessed in 30+ days)
    const staleRow = sql
      .exec(
        `SELECT COUNT(*) AS cnt FROM memories
         WHERE (last_accessed_at IS NULL AND created_at < datetime('now', '-30 days'))
            OR (last_accessed_at IS NOT NULL AND last_accessed_at < datetime('now', '-30 days'))`,
      )
      .one() as Record<string, unknown>;

    // Average memory age
    const ageRow = sql
      .exec(
        "SELECT ROUND(AVG(julianday('now') - julianday(created_at)), 1) AS avg_age FROM memories",
      )
      .one() as Record<string, unknown>;

    // Search telemetry from daily_metrics (period-scoped, not lifetime)
    const searchRow = sql
      .exec(
        `SELECT COALESCE(SUM(CASE WHEN metric = 'memories_searched' THEN count ELSE 0 END), 0) AS searches,
                COALESCE(SUM(CASE WHEN metric = 'memories_search_hits' THEN count ELSE 0 END), 0) AS hits
         FROM daily_metrics
         WHERE date > date('now', '-' || ? || ' days')
           AND metric IN ('memories_searched', 'memories_search_hits')`,
        days,
      )
      .one() as Record<string, unknown>;

    const searches = (searchRow?.searches as number) || 0;
    const hits = (searchRow?.hits as number) || 0;

    return {
      total_memories: total,
      searches,
      searches_with_results: hits,
      search_hit_rate: searches > 0 ? Math.round((hits / searches) * 1000) / 10 : 0,
      memories_created_period: (periodRow?.created as number) || 0,
      memories_updated_period: (periodRow?.updated as number) || 0,
      stale_memories: (staleRow?.cnt as number) || 0,
      avg_memory_age_days: (ageRow?.avg_age as number) || 0,
    };
  } catch (err) {
    log.warn(`memoryUsage query failed: ${err}`);
    return {
      total_memories: 0,
      searches: 0,
      searches_with_results: 0,
      search_hit_rate: 0,
      memories_created_period: 0,
      memories_updated_period: 0,
      stale_memories: 0,
      avg_memory_age_days: 0,
    };
  }
}

export function queryMemoryOutcomeCorrelation(
  sql: SqlStorage,
  days: number,
): MemoryOutcomeCorrelation[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           CASE WHEN memories_searched > 0 THEN 'used memory' ELSE 'no memory' END AS bucket,
           COUNT(*) AS sessions,
           SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
           ROUND(CAST(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(*), 0) * 100, 1) AS completion_rate
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
         GROUP BY bucket
         ORDER BY bucket`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        bucket: row.bucket as string,
        sessions: (row.sessions as number) || 0,
        completed: (row.completed as number) || 0,
        completion_rate: (row.completion_rate as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`memoryOutcomeCorrelation query failed: ${err}`);
    return [];
  }
}

export function queryTopMemories(sql: SqlStorage, days: number): MemoryAccessEntry[] {
  try {
    const rows = sql
      .exec(
        `SELECT id, text, access_count, last_accessed_at, created_at
         FROM memories
         WHERE access_count > 0
           AND (last_accessed_at IS NOT NULL AND last_accessed_at > datetime('now', '-' || ? || ' days'))
         ORDER BY access_count DESC
         LIMIT 20`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      const text = row.text as string;
      return {
        id: row.id as string,
        text_preview: text.length > 120 ? text.slice(0, 120) + '...' : text,
        access_count: (row.access_count as number) || 0,
        last_accessed_at: (row.last_accessed_at as string) || null,
        created_at: row.created_at as string,
      };
    });
  } catch (err) {
    log.warn(`topMemories query failed: ${err}`);
    return [];
  }
}
