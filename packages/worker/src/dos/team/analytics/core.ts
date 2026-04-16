// Analytics core: base analytics assembly and foundational queries.

import { createLogger } from '../../../lib/logger.js';
import type {
  FileHeatmapEntry,
  DailyTrend,
  OutcomeCount,
  ToolDistribution,
  DailyMetricEntry,
  TeamAnalytics,
} from '@chinwag/shared/contracts/analytics.js';

const log = createLogger('TeamDO.analytics');

export const HEATMAP_LIMIT = 50;
export const ANALYTICS_MAX_DAYS = 90;

export function getAnalytics(sql: SqlStorage, days: number): TeamAnalytics {
  const periodDays = Math.max(1, Math.min(days, ANALYTICS_MAX_DAYS));

  return {
    ok: true,
    period_days: periodDays,
    file_heatmap: queryFileHeatmap(sql, periodDays),
    daily_trends: queryDailyTrends(sql, periodDays),
    tool_distribution: queryToolDistribution(sql, periodDays),
    outcome_distribution: queryOutcomeDistribution(sql, periodDays),
    daily_metrics: queryDailyMetrics(sql, periodDays),
  };
}

export function queryFileHeatmap(sql: SqlStorage, days: number): FileHeatmapEntry[] {
  try {
    const rows = sql
      .exec(
        `SELECT value AS file, COUNT(*) AS touch_count
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
      };
    });
  } catch (err) {
    log.warn(`fileHeatmap query failed: ${err}`);
    return [];
  }
}

export function queryDailyTrends(sql: SqlStorage, days: number): DailyTrend[] {
  try {
    const rows = sql
      .exec(
        `SELECT date(started_at) AS day,
                COUNT(*) AS sessions,
                COALESCE(SUM(edit_count), 0) AS edits,
                COALESCE(SUM(lines_added), 0) AS lines_added,
                COALESCE(SUM(lines_removed), 0) AS lines_removed,
                ROUND(AVG(
                  ROUND((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24 * 60)
                ), 1) AS avg_duration_min,
                SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
                SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
         GROUP BY date(started_at)
         ORDER BY day ASC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        day: row.day as string,
        sessions: (row.sessions as number) || 0,
        edits: (row.edits as number) || 0,
        lines_added: (row.lines_added as number) || 0,
        lines_removed: (row.lines_removed as number) || 0,
        avg_duration_min: (row.avg_duration_min as number) || 0,
        completed: (row.completed as number) || 0,
        abandoned: (row.abandoned as number) || 0,
        failed: (row.failed as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`dailyTrends query failed: ${err}`);
    return [];
  }
}

export function queryToolDistribution(sql: SqlStorage, days: number): ToolDistribution[] {
  try {
    const rows = sql
      .exec(
        `SELECT host_tool,
                COUNT(*) AS sessions,
                COALESCE(SUM(edit_count), 0) AS edits
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND host_tool IS NOT NULL AND host_tool != 'unknown'
         GROUP BY host_tool
         ORDER BY sessions DESC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        host_tool: row.host_tool as string,
        sessions: (row.sessions as number) || 0,
        edits: (row.edits as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`toolDistribution query failed: ${err}`);
    return [];
  }
}

export function queryOutcomeDistribution(sql: SqlStorage, days: number): OutcomeCount[] {
  try {
    const rows = sql
      .exec(
        `SELECT COALESCE(outcome, 'unknown') AS outcome,
                COUNT(*) AS count
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
         GROUP BY outcome
         ORDER BY count DESC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        outcome: row.outcome as string,
        count: (row.count as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`outcomeDistribution query failed: ${err}`);
    return [];
  }
}

export function queryDailyMetrics(sql: SqlStorage, days: number): DailyMetricEntry[] {
  try {
    const rows = sql
      .exec(
        `SELECT date, metric, count
         FROM daily_metrics
         WHERE date > date('now', '-' || ? || ' days')
         ORDER BY date ASC, metric ASC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        date: row.date as string,
        metric: row.metric as string,
        count: (row.count as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`dailyMetrics query failed: ${err}`);
    return [];
  }
}
