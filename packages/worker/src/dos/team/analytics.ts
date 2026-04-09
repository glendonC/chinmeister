// Analytics aggregation queries for workflow intelligence.
// All queries run on the sessions and daily_metrics tables within TeamDO.

import { safeParse } from '../../lib/safe-parse.js';
import { createLogger } from '../../lib/logger.js';
import type {
  FileHeatmapEntry,
  DailyTrend,
  OutcomeCount,
  ToolDistribution,
  ToolOutcome,
  DailyMetricEntry,
  TeamAnalytics,
  HourlyBucket,
  ToolHourlyBucket,
  ToolDailyTrend,
  ModelOutcome,
  UserAnalytics,
  CompletionSummary,
  ToolComparison,
  WorkTypeDistribution,
  ToolWorkTypeBreakdown,
  FileChurnEntry,
  DurationBucket,
  ConcurrentEditEntry,
  MemberAnalytics,
  RetryPattern,
  ConflictCorrelation,
  EditVelocityTrend,
  MemoryUsageStats,
} from '@chinwag/shared/contracts.js';

const log = createLogger('TeamDO.analytics');

const HEATMAP_LIMIT = 50;
const ANALYTICS_MAX_DAYS = 90;

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

function queryFileHeatmap(sql: SqlStorage, days: number): FileHeatmapEntry[] {
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

function queryDailyTrends(sql: SqlStorage, days: number): DailyTrend[] {
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

function queryToolDistribution(sql: SqlStorage, days: number): ToolDistribution[] {
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

function queryOutcomeDistribution(sql: SqlStorage, days: number): OutcomeCount[] {
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

function queryDailyMetrics(sql: SqlStorage, days: number): DailyMetricEntry[] {
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

function queryHourlyDistribution(sql: SqlStorage, days: number): HourlyBucket[] {
  try {
    const rows = sql
      .exec(
        `SELECT CAST(strftime('%H', started_at) AS INTEGER) AS hour,
                CAST(strftime('%w', started_at) AS INTEGER) AS dow,
                COUNT(*) AS sessions,
                COALESCE(SUM(edit_count), 0) AS edits
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
         GROUP BY hour, dow
         ORDER BY hour, dow`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        hour: (row.hour as number) || 0,
        dow: (row.dow as number) || 0,
        sessions: (row.sessions as number) || 0,
        edits: (row.edits as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`hourlyDistribution query failed: ${err}`);
    return [];
  }
}

function queryToolHourly(sql: SqlStorage, days: number): ToolHourlyBucket[] {
  try {
    const rows = sql
      .exec(
        `SELECT host_tool,
                CAST(strftime('%H', started_at) AS INTEGER) AS hour,
                CAST(strftime('%w', started_at) AS INTEGER) AS dow,
                COUNT(*) AS sessions,
                COALESCE(SUM(edit_count), 0) AS edits
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND host_tool IS NOT NULL AND host_tool != 'unknown'
         GROUP BY host_tool, hour, dow
         ORDER BY host_tool, hour, dow`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        host_tool: row.host_tool as string,
        hour: (row.hour as number) || 0,
        dow: (row.dow as number) || 0,
        sessions: (row.sessions as number) || 0,
        edits: (row.edits as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`toolHourly query failed: ${err}`);
    return [];
  }
}

function queryToolDaily(sql: SqlStorage, days: number): ToolDailyTrend[] {
  try {
    const rows = sql
      .exec(
        `SELECT host_tool,
                date(started_at) AS day,
                COUNT(*) AS sessions,
                COALESCE(SUM(edit_count), 0) AS edits,
                COALESCE(SUM(lines_added), 0) AS lines_added,
                COALESCE(SUM(lines_removed), 0) AS lines_removed,
                ROUND(AVG(
                  ROUND((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24 * 60)
                ), 1) AS avg_duration_min
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND host_tool IS NOT NULL AND host_tool != 'unknown'
         GROUP BY host_tool, day
         ORDER BY day ASC, host_tool ASC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        host_tool: row.host_tool as string,
        day: row.day as string,
        sessions: (row.sessions as number) || 0,
        edits: (row.edits as number) || 0,
        lines_added: (row.lines_added as number) || 0,
        lines_removed: (row.lines_removed as number) || 0,
        avg_duration_min: (row.avg_duration_min as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`toolDaily query failed: ${err}`);
    return [];
  }
}

function queryModelPerformance(sql: SqlStorage, days: number): ModelOutcome[] {
  try {
    const rows = sql
      .exec(
        `SELECT agent_model,
                COALESCE(outcome, 'unknown') AS outcome,
                COUNT(*) AS count,
                ROUND(AVG(
                  ROUND((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24 * 60)
                ), 1) AS avg_duration_min,
                COALESCE(SUM(edit_count), 0) AS total_edits
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND agent_model IS NOT NULL AND agent_model != ''
         GROUP BY agent_model, outcome
         ORDER BY count DESC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        agent_model: row.agent_model as string,
        outcome: row.outcome as string,
        count: (row.count as number) || 0,
        avg_duration_min: (row.avg_duration_min as number) || 0,
        total_edits: (row.total_edits as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`modelPerformance query failed: ${err}`);
    return [];
  }
}

function queryToolOutcomes(sql: SqlStorage, days: number): ToolOutcome[] {
  try {
    const rows = sql
      .exec(
        `SELECT host_tool,
                COALESCE(outcome, 'unknown') AS outcome,
                COUNT(*) AS count
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND host_tool IS NOT NULL AND host_tool != 'unknown'
         GROUP BY host_tool, outcome
         ORDER BY count DESC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        host_tool: row.host_tool as string,
        outcome: row.outcome as string,
        count: (row.count as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`toolOutcomes query failed: ${err}`);
    return [];
  }
}

// SQL CASE expression for classifying file paths into work types.
// Test patterns go first (most specific), then docs/styling/frontend/backend/config, else other.
const WORK_TYPE_CASE = `
  CASE
    WHEN file_path LIKE '%.test.%' OR file_path LIKE '%.spec.%' OR file_path LIKE '%__tests__%' THEN 'test'
    WHEN file_path LIKE '%.md' OR file_path LIKE '%/docs/%' THEN 'docs'
    WHEN file_path LIKE '%.css' OR file_path LIKE '%.scss' OR file_path LIKE '%.module.css' THEN 'styling'
    WHEN file_path LIKE '%.tsx' OR file_path LIKE '%.jsx'
      OR file_path LIKE '%/components/%' OR file_path LIKE '%/views/%'
      OR file_path LIKE '%/hooks/%' OR file_path LIKE '%/pages/%' THEN 'frontend'
    WHEN file_path LIKE '%/routes/%' OR file_path LIKE '%/dos/%'
      OR file_path LIKE '%/api/%' OR file_path LIKE '%/server/%'
      OR file_path LIKE '%/workers/%' THEN 'backend'
    WHEN file_path LIKE '%package.json' OR file_path LIKE '%tsconfig%'
      OR file_path LIKE '%wrangler%' OR file_path LIKE '%.config.%'
      OR file_path LIKE '%.eslint%' OR file_path LIKE '%.prettier%' THEN 'config'
    ELSE 'other'
  END`;

// Same classification for files from the sessions.files_touched JSON array
// where the column alias is 'value' (from json_each).
const WORK_TYPE_CASE_VALUE = WORK_TYPE_CASE.replace(/file_path/g, 'value');

/** Classify a file path into a work type. JS-side mirror of the SQL CASE. */
export function classifyWorkType(filePath: string): string {
  const p = filePath.toLowerCase();
  if (p.includes('.test.') || p.includes('.spec.') || p.includes('__tests__')) return 'test';
  if (p.endsWith('.md') || p.includes('/docs/')) return 'docs';
  if (p.endsWith('.css') || p.endsWith('.scss') || p.includes('.module.css')) return 'styling';
  if (
    p.endsWith('.tsx') ||
    p.endsWith('.jsx') ||
    p.includes('/components/') ||
    p.includes('/views/') ||
    p.includes('/hooks/') ||
    p.includes('/pages/')
  )
    return 'frontend';
  if (
    p.includes('/routes/') ||
    p.includes('/dos/') ||
    p.includes('/api/') ||
    p.includes('/server/') ||
    p.includes('/workers/')
  )
    return 'backend';
  if (
    p.includes('package.json') ||
    p.includes('tsconfig') ||
    p.includes('wrangler') ||
    p.includes('.config.') ||
    p.includes('.eslint') ||
    p.includes('.prettier')
  )
    return 'config';
  return 'other';
}

function queryCompletionSummary(sql: SqlStorage, days: number): CompletionSummary {
  try {
    const current = sql
      .exec(
        `SELECT
           COUNT(*) AS total_sessions,
           SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
           SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN outcome IS NULL THEN 1 ELSE 0 END) AS unknown
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')`,
        days,
      )
      .toArray();

    const c = (current[0] || {}) as Record<string, unknown>;
    const total = (c.total_sessions as number) || 0;
    const completed = (c.completed as number) || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    // Previous period for comparison
    let prevRate: number | null = null;
    try {
      const prev = sql
        .exec(
          `SELECT
             COUNT(*) AS total_sessions,
             SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS completed
           FROM sessions
           WHERE started_at > datetime('now', '-' || ? || ' days')
             AND started_at <= datetime('now', '-' || ? || ' days')`,
          days * 2,
          days,
        )
        .toArray();
      const p = (prev[0] || {}) as Record<string, unknown>;
      const pTotal = (p.total_sessions as number) || 0;
      const pCompleted = (p.completed as number) || 0;
      if (pTotal > 0) prevRate = Math.round((pCompleted / pTotal) * 1000) / 10;
    } catch {
      // previous period comparison is best-effort
    }

    return {
      total_sessions: total,
      completed,
      abandoned: (c.abandoned as number) || 0,
      failed: (c.failed as number) || 0,
      unknown: (c.unknown as number) || 0,
      completion_rate: completionRate,
      prev_completion_rate: prevRate,
    };
  } catch (err) {
    log.warn(`completionSummary query failed: ${err}`);
    return {
      total_sessions: 0,
      completed: 0,
      abandoned: 0,
      failed: 0,
      unknown: 0,
      completion_rate: 0,
      prev_completion_rate: null,
    };
  }
}

function queryToolComparison(sql: SqlStorage, days: number): ToolComparison[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           host_tool,
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
           COALESCE(SUM(lines_removed), 0) AS total_lines_removed
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
        completed: (row.completed as number) || 0,
        abandoned: (row.abandoned as number) || 0,
        failed: (row.failed as number) || 0,
        completion_rate: (row.completion_rate as number) || 0,
        avg_duration_min: (row.avg_duration_min as number) || 0,
        total_edits: (row.total_edits as number) || 0,
        total_lines_added: (row.total_lines_added as number) || 0,
        total_lines_removed: (row.total_lines_removed as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`toolComparison query failed: ${err}`);
    return [];
  }
}

function queryWorkTypeDistribution(sql: SqlStorage, days: number): WorkTypeDistribution[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           ${WORK_TYPE_CASE} AS work_type,
           COUNT(DISTINCT session_id) AS sessions,
           COUNT(*) AS edits,
           COALESCE(SUM(lines_added), 0) AS lines_added,
           COALESCE(SUM(lines_removed), 0) AS lines_removed,
           COUNT(DISTINCT file_path) AS files
         FROM edits
         WHERE created_at > datetime('now', '-' || ? || ' days')
         GROUP BY work_type
         ORDER BY sessions DESC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        work_type: row.work_type as string,
        sessions: (row.sessions as number) || 0,
        edits: (row.edits as number) || 0,
        lines_added: (row.lines_added as number) || 0,
        lines_removed: (row.lines_removed as number) || 0,
        files: (row.files as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`workTypeDistribution query failed: ${err}`);
    return [];
  }
}

function queryToolWorkType(sql: SqlStorage, days: number): ToolWorkTypeBreakdown[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           host_tool,
           ${WORK_TYPE_CASE} AS work_type,
           COUNT(DISTINCT session_id) AS sessions,
           COUNT(*) AS edits
         FROM edits
         WHERE created_at > datetime('now', '-' || ? || ' days')
           AND host_tool IS NOT NULL AND host_tool != 'unknown'
         GROUP BY host_tool, work_type
         ORDER BY host_tool, sessions DESC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        host_tool: row.host_tool as string,
        work_type: row.work_type as string,
        sessions: (row.sessions as number) || 0,
        edits: (row.edits as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`toolWorkType query failed: ${err}`);
    return [];
  }
}

function queryFileChurn(sql: SqlStorage, days: number): FileChurnEntry[] {
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

function queryDurationDistribution(sql: SqlStorage, days: number): DurationBucket[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           CASE
             WHEN duration_min < 5 THEN '0-5m'
             WHEN duration_min < 15 THEN '5-15m'
             WHEN duration_min < 30 THEN '15-30m'
             WHEN duration_min < 60 THEN '30-60m'
             ELSE '60m+'
           END AS bucket,
           COUNT(*) AS count
         FROM (
           SELECT ROUND((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24 * 60) AS duration_min
           FROM sessions
           WHERE started_at > datetime('now', '-' || ? || ' days')
             AND ended_at IS NOT NULL
         )
         GROUP BY bucket
         ORDER BY
           CASE bucket
             WHEN '0-5m' THEN 1
             WHEN '5-15m' THEN 2
             WHEN '15-30m' THEN 3
             WHEN '30-60m' THEN 4
             ELSE 5
           END`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        bucket: row.bucket as string,
        count: (row.count as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`durationDistribution query failed: ${err}`);
    return [];
  }
}

function queryConcurrentEdits(sql: SqlStorage, days: number): ConcurrentEditEntry[] {
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

function queryMemberAnalytics(sql: SqlStorage, days: number): MemberAnalytics[] {
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
           COALESCE(SUM(lines_removed), 0) AS total_lines_removed
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
        primary_tool: primaryTools.get(handle) || null,
      };
    });
  } catch (err) {
    log.warn(`memberAnalytics query failed: ${err}`);
    return [];
  }
}

function queryRetryPatterns(sql: SqlStorage, days: number): RetryPattern[] {
  try {
    // Find files that were touched by the same handle across multiple sessions,
    // where at least one prior session was abandoned or failed.
    // This indicates retry/rework patterns.
    const rows = sql
      .exec(
        `SELECT
           s.handle,
           f.value AS file,
           COUNT(DISTINCT s.id) AS attempts,
           (SELECT outcome FROM sessions s2, json_each(s2.files_touched) f2
            WHERE s2.handle = s.handle AND f2.value = f.value
              AND s2.started_at > datetime('now', '-' || ? || ' days')
            ORDER BY s2.started_at DESC LIMIT 1) AS final_outcome
         FROM sessions s, json_each(s.files_touched) f
         WHERE s.started_at > datetime('now', '-' || ? || ' days')
           AND s.files_touched != '[]'
           AND EXISTS (
             SELECT 1 FROM sessions s3, json_each(s3.files_touched) f3
             WHERE s3.handle = s.handle AND f3.value = f.value
               AND s3.id != s.id
               AND s3.outcome IN ('abandoned', 'failed')
               AND s3.started_at > datetime('now', '-' || ? || ' days')
           )
         GROUP BY s.handle, f.value
         HAVING attempts >= 2
         ORDER BY attempts DESC
         LIMIT 30`,
        days,
        days,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      const finalOutcome = (row.final_outcome as string) || null;
      return {
        handle: row.handle as string,
        file: row.file as string,
        attempts: (row.attempts as number) || 0,
        final_outcome: finalOutcome,
        resolved: finalOutcome === 'completed',
      };
    });
  } catch (err) {
    log.warn(`retryPatterns query failed: ${err}`);
    return [];
  }
}

function queryConflictCorrelation(sql: SqlStorage, days: number): ConflictCorrelation[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           CASE WHEN conflicts_hit > 0 THEN '1+ conflicts' ELSE 'no conflicts' END AS bucket,
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
    log.warn(`conflictCorrelation query failed: ${err}`);
    return [];
  }
}

function queryEditVelocity(sql: SqlStorage, days: number): EditVelocityTrend[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           date(started_at) AS day,
           COALESCE(SUM(edit_count), 0) AS total_edits,
           COALESCE(SUM(lines_added + lines_removed), 0) AS total_lines,
           SUM(
             ROUND((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24, 2)
           ) AS total_hours
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND ended_at IS NOT NULL
         GROUP BY date(started_at)
         ORDER BY day ASC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      const hours = (row.total_hours as number) || 0;
      const edits = (row.total_edits as number) || 0;
      const lines = (row.total_lines as number) || 0;
      return {
        day: row.day as string,
        edits_per_hour: hours > 0 ? Math.round((edits / hours) * 10) / 10 : 0,
        lines_per_hour: hours > 0 ? Math.round((lines / hours) * 10) / 10 : 0,
        total_session_hours: Math.round(hours * 100) / 100,
      };
    });
  } catch (err) {
    log.warn(`editVelocity query failed: ${err}`);
    return [];
  }
}

function queryMemoryUsage(sql: SqlStorage, days: number): MemoryUsageStats {
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

    // Search telemetry from telemetry table
    const searchRow = sql
      .exec(
        "SELECT COALESCE(SUM(CASE WHEN metric = 'memories_searched' THEN count ELSE 0 END), 0) AS searches, COALESCE(SUM(CASE WHEN metric = 'memories_search_hits' THEN count ELSE 0 END), 0) AS hits FROM telemetry WHERE metric IN ('memories_searched', 'memories_search_hits')",
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

function queryFileHeatmapEnhanced(sql: SqlStorage, days: number): FileHeatmapEntry[] {
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

export function getExtendedAnalytics(
  sql: SqlStorage,
  days: number,
): Omit<UserAnalytics, 'teams_included' | 'degraded'> {
  const base = getAnalytics(sql, days);
  return {
    ...base,
    // Override basic heatmap with enhanced version
    file_heatmap: queryFileHeatmapEnhanced(sql, days),
    hourly_distribution: queryHourlyDistribution(sql, days),
    tool_hourly: queryToolHourly(sql, days),
    tool_daily: queryToolDaily(sql, days),
    model_outcomes: queryModelPerformance(sql, days),
    tool_outcomes: queryToolOutcomes(sql, days),
    completion_summary: queryCompletionSummary(sql, days),
    tool_comparison: queryToolComparison(sql, days),
    work_type_distribution: queryWorkTypeDistribution(sql, days),
    tool_work_type: queryToolWorkType(sql, days),
    file_churn: queryFileChurn(sql, days),
    duration_distribution: queryDurationDistribution(sql, days),
    concurrent_edits: queryConcurrentEdits(sql, days),
    member_analytics: queryMemberAnalytics(sql, days),
    retry_patterns: queryRetryPatterns(sql, days),
    conflict_correlation: queryConflictCorrelation(sql, days),
    edit_velocity: queryEditVelocity(sql, days),
    memory_usage: queryMemoryUsage(sql, days),
  };
}
