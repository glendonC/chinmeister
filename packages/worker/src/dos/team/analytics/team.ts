// Team analytics: member-level analytics.

import { createLogger } from '../../../lib/logger.js';
import type { MemberAnalytics } from '@chinwag/shared/contracts/analytics.js';

const log = createLogger('TeamDO.analytics');

export function queryMemberAnalytics(sql: SqlStorage, days: number): MemberAnalytics[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           handle,
           COUNT(*) AS sessions,
           SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
           SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failed,
           ROUND(CAST(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(*), 0) * 100, 1) AS completion_rate,
           ROUND(AVG(
             ROUND((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24 * 60)
           ), 1) AS avg_duration_min,
           COALESCE(SUM(edit_count), 0) AS total_edits,
           COALESCE(SUM(lines_added), 0) AS total_lines_added,
           COALESCE(SUM(lines_removed), 0) AS total_lines_removed,
           COALESCE(SUM(commit_count), 0) AS total_commits
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
         GROUP BY handle
         ORDER BY sessions DESC
         LIMIT 50`,
        days,
      )
      .toArray();

    // Get primary tool per handle in a second pass
    const toolRows = sql
      .exec(
        `SELECT handle, host_tool, COUNT(*) AS cnt
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND host_tool IS NOT NULL AND host_tool != 'unknown'
         GROUP BY handle, host_tool
         ORDER BY handle, cnt DESC`,
        days,
      )
      .toArray();

    const primaryTools = new Map<string, string>();
    for (const t of toolRows) {
      const row = t as Record<string, unknown>;
      const h = row.handle as string;
      if (!primaryTools.has(h)) primaryTools.set(h, row.host_tool as string);
    }

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      const handle = row.handle as string;
      return {
        handle,
        sessions: (row.sessions as number) || 0,
        completed: (row.completed as number) || 0,
        abandoned: (row.abandoned as number) || 0,
        failed: (row.failed as number) || 0,
        completion_rate: (row.completion_rate as number) || 0,
        avg_duration_min: (row.avg_duration_min as number) || 0,
        total_edits: (row.total_edits as number) || 0,
        total_lines_added: (row.total_lines_added as number) || 0,
        total_lines_removed: (row.total_lines_removed as number) || 0,
        total_commits: (row.total_commits as number) || 0,
        primary_tool: primaryTools.get(handle) || null,
      };
    });
  } catch (err) {
    log.warn(`memberAnalytics query failed: ${err}`);
    return [];
  }
}
