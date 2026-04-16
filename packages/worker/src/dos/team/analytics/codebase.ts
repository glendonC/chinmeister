// Codebase analytics: file churn, concurrent edits, heatmaps, rework, staleness.

import { createLogger } from '../../../lib/logger.js';
import { classifyWorkType } from './outcomes.js';
import { HEATMAP_LIMIT } from './core.js';
import type {
  FileChurnEntry,
  ConcurrentEditEntry,
  FileHeatmapEntry,
  FileReworkEntry,
  DirectoryHeatmapEntry,
  AuditStalenessEntry,
} from '@chinwag/shared/contracts/analytics.js';

const log = createLogger('TeamDO.analytics');

/** Extract directory from a file path (up to 3 segments deep). */
function extractDirectory(filePath: string): string {
  const parts = filePath.split('/').filter(Boolean);
  // Keep up to 3 directory segments for meaningful grouping
  const dirParts = parts.slice(0, Math.min(parts.length - 1, 3));
  return dirParts.length > 0 ? dirParts.join('/') : '.';
}

export function queryFileChurn(sql: SqlStorage, days: number): FileChurnEntry[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           file_path AS file,
           COUNT(DISTINCT session_id) AS session_count,
           COUNT(*) AS total_edits,
           COALESCE(SUM(lines_added + lines_removed), 0) AS total_lines
         FROM edits
         WHERE created_at > datetime('now', '-' || ? || ' days')
         GROUP BY file_path
         HAVING session_count >= 2
         ORDER BY session_count DESC
         LIMIT 30`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        file: row.file as string,
        session_count: (row.session_count as number) || 0,
        total_edits: (row.total_edits as number) || 0,
        total_lines: (row.total_lines as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`fileChurn query failed: ${err}`);
    return [];
  }
}

export function queryConcurrentEdits(sql: SqlStorage, days: number): ConcurrentEditEntry[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           file_path AS file,
           COUNT(DISTINCT handle) AS agents,
           COUNT(*) AS edit_count
         FROM edits
         WHERE created_at > datetime('now', '-' || ? || ' days')
         GROUP BY file_path
         HAVING agents >= 2
         ORDER BY agents DESC, edit_count DESC
         LIMIT 20`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        file: row.file as string,
        agents: (row.agents as number) || 0,
        edit_count: (row.edit_count as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`concurrentEdits query failed: ${err}`);
    return [];
  }
}

export function queryFileHeatmapEnhanced(sql: SqlStorage, days: number): FileHeatmapEntry[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           value AS file,
           COUNT(*) AS touch_count,
           ROUND(CAST(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(*), 0) * 100, 1) AS outcome_rate,
           COALESCE(SUM(lines_added), 0) AS total_lines_added,
           COALESCE(SUM(lines_removed), 0) AS total_lines_removed
         FROM sessions, json_each(sessions.files_touched)
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND files_touched != '[]'
         GROUP BY value
         ORDER BY touch_count DESC
         LIMIT ?`,
        days,
        HEATMAP_LIMIT,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        file: row.file as string,
        touch_count: (row.touch_count as number) || 0,
        work_type: classifyWorkType(row.file as string),
        outcome_rate: (row.outcome_rate as number) || 0,
        total_lines_added: (row.total_lines_added as number) || 0,
        total_lines_removed: (row.total_lines_removed as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`fileHeatmapEnhanced query failed: ${err}`);
    return [];
  }
}

export function queryFileRework(sql: SqlStorage, days: number): FileReworkEntry[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           e.file_path AS file,
           COUNT(*) AS total_edits,
           SUM(CASE WHEN s.outcome IN ('abandoned', 'failed') THEN 1 ELSE 0 END) AS failed_edits,
           ROUND(CAST(SUM(CASE WHEN s.outcome IN ('abandoned', 'failed') THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(*), 0) * 100, 1) AS rework_ratio
         FROM edits e
         JOIN sessions s ON s.id = e.session_id
         WHERE e.created_at > datetime('now', '-' || ? || ' days')
         GROUP BY e.file_path
         HAVING total_edits >= 3 AND failed_edits >= 1
         ORDER BY rework_ratio DESC
         LIMIT 30`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        file: row.file as string,
        total_edits: (row.total_edits as number) || 0,
        failed_edits: (row.failed_edits as number) || 0,
        rework_ratio: (row.rework_ratio as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`fileRework query failed: ${err}`);
    return [];
  }
}

export function queryDirectoryHeatmap(sql: SqlStorage, days: number): DirectoryHeatmapEntry[] {
  try {
    // Query file-level data and roll up to directories in JS
    // (SQLite lacks a clean dirname function)
    const rows = sql
      .exec(
        `SELECT
           value AS file,
           COUNT(*) AS touch_count,
           COALESCE(SUM(lines_added + lines_removed), 0) AS total_lines,
           ROUND(CAST(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(*), 0) * 100, 1) AS completion_rate
         FROM sessions, json_each(sessions.files_touched)
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND files_touched != '[]'
         GROUP BY value`,
        days,
      )
      .toArray();

    const dirMap = new Map<
      string,
      {
        touch_count: number;
        file_count: number;
        total_lines: number;
        completed_sum: number;
        total_sum: number;
      }
    >();

    for (const r of rows) {
      const row = r as Record<string, unknown>;
      const dir = extractDirectory(row.file as string);
      const existing = dirMap.get(dir) || {
        touch_count: 0,
        file_count: 0,
        total_lines: 0,
        completed_sum: 0,
        total_sum: 0,
      };
      const touches = (row.touch_count as number) || 0;
      existing.touch_count += touches;
      existing.file_count += 1;
      existing.total_lines += (row.total_lines as number) || 0;
      existing.completed_sum += ((row.completion_rate as number) || 0) * touches;
      existing.total_sum += touches;
      dirMap.set(dir, existing);
    }

    return [...dirMap.entries()]
      .map(([directory, v]) => ({
        directory,
        touch_count: v.touch_count,
        file_count: v.file_count,
        total_lines: v.total_lines,
        completion_rate:
          v.total_sum > 0 ? Math.round((v.completed_sum / v.total_sum) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.touch_count - a.touch_count)
      .slice(0, 30);
  } catch (err) {
    log.warn(`directoryHeatmap query failed: ${err}`);
    return [];
  }
}

export function queryAuditStaleness(sql: SqlStorage, days: number): AuditStalenessEntry[] {
  try {
    // Find directories with significant past activity that haven't been touched recently
    const rows = sql
      .exec(
        `SELECT
           file_path,
           MAX(created_at) AS last_edit,
           COUNT(*) AS edit_count
         FROM edits
         WHERE created_at > datetime('now', '-' || ? || ' days')
         GROUP BY file_path
         HAVING edit_count >= 3`,
        days,
      )
      .toArray();

    // Roll up to directory level and filter for stale ones
    const dirMap = new Map<string, { last_edit: string; edit_count: number }>();

    for (const r of rows) {
      const row = r as Record<string, unknown>;
      const dir = extractDirectory(row.file_path as string);
      const existing = dirMap.get(dir);
      const lastEdit = row.last_edit as string;
      const editCount = (row.edit_count as number) || 0;

      if (!existing || lastEdit > existing.last_edit) {
        dirMap.set(dir, {
          last_edit: lastEdit,
          edit_count: (existing?.edit_count || 0) + editCount,
        });
      } else {
        existing.edit_count += editCount;
      }
    }

    const now = Date.now();
    return [...dirMap.entries()]
      .map(([directory, v]) => {
        const daysSince = Math.round((now - new Date(v.last_edit + 'Z').getTime()) / 86400000);
        return {
          directory,
          last_edit: v.last_edit,
          days_since: daysSince,
          prior_edit_count: v.edit_count,
        };
      })
      .filter((e) => e.days_since >= 14 && e.prior_edit_count >= 5)
      .sort((a, b) => b.days_since - a.days_since)
      .slice(0, 20);
  } catch (err) {
    log.warn(`auditStaleness query failed: ${err}`);
    return [];
  }
}
