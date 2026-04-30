// Period comparison analytics: current vs previous period metrics.
//
// Window alignment: `current` spans the last `days` days, `previous` spans the
// same length immediately before that. We deliberately do NOT clamp to
// SESSION_RETENTION_DAYS here - the retention cutoff is handled by the data
// itself (sessions older than 30d are pruned). At `days > 30` the previous
// window reaches into pruned data, queryPeriodMetrics returns null, and the
// client hides the delta. That matches the widget's value (sum of
// daily_trends over the same window) without manufacturing a mismatched
// shorter delta window.

import { createLogger } from '../../../lib/logger.js';
import { EDIT_TOOLS } from '@chinmeister/shared/tool-call-categories.js';
import type { PeriodComparison, PeriodMetrics } from '@chinmeister/shared/contracts/analytics.js';
import { type AnalyticsScope, withScope } from './scope.js';

const log = createLogger('TeamDO.analytics');

// Hourly completion-rate median needs at least this many qualified hours
// (sessions > 0) before we publish the metric. Mirrors the renderer's
// EFFECTIVE_HOURS_MIN_QUALIFIED gate so a thin window can't produce a
// noisy median that the UI would then suppress.
const QUALIFIED_HOUR_MIN = 4;

export function queryPeriodComparison(
  sql: SqlStorage,
  scope: AnalyticsScope,
  days: number,
): PeriodComparison {
  const effectiveDays = days;

  function queryPeriodMetrics(offsetStart: number, offsetEnd: number): PeriodMetrics | null {
    try {
      const { sql: q, params } = withScope(
        `SELECT
             COUNT(*) AS total_sessions,
             SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
             ROUND(AVG(
               ROUND((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 24 * 60)
             ), 1) AS avg_duration_min,
             SUM(CASE WHEN got_stuck = 1 THEN 1 ELSE 0 END) AS stuck_sessions,
             COALESCE(SUM(edit_count), 0) AS total_edits,
             COALESCE(SUM(
               CASE WHEN ended_at IS NOT NULL
                 THEN ROUND((julianday(ended_at) - julianday(started_at)) * 24, 2)
                 ELSE 0
               END
             ), 0) AS total_session_hours,
             SUM(CASE WHEN memories_searched > 0 THEN 1 ELSE 0 END) AS sessions_with_memory
           FROM sessions
           WHERE started_at > datetime('now', '-' || ? || ' days')
             AND started_at <= datetime('now', '-' || ? || ' days')`,
        [offsetStart, offsetEnd],
        scope,
      );
      const rows = sql.exec(q, ...params).toArray();

      const r = (rows[0] || {}) as Record<string, unknown>;
      const total = (r.total_sessions as number) || 0;
      if (total === 0) return null;

      const completed = (r.completed as number) || 0;
      const totalHours = (r.total_session_hours as number) || 0;
      const totalEdits = (r.total_edits as number) || 0;
      const stuck = (r.stuck_sessions as number) || 0;

      // Memory hit rate from daily_metrics (period-scoped)
      // Scope: not applicable - daily_metrics has no per-user dimension
      let memoryHitRate = 0;
      try {
        const telRows = sql
          .exec(
            `SELECT
               COALESCE(SUM(CASE WHEN metric = 'memories_searched' THEN count ELSE 0 END), 0) AS searches,
               COALESCE(SUM(CASE WHEN metric = 'memories_search_hits' THEN count ELSE 0 END), 0) AS hits
             FROM daily_metrics
             WHERE date > date('now', '-' || ? || ' days')
               AND date <= date('now', '-' || ? || ' days')
               AND metric IN ('memories_searched', 'memories_search_hits')`,
            offsetStart,
            offsetEnd,
          )
          .toArray();
        const t = (telRows[0] || {}) as Record<string, unknown>;
        const searches = (t.searches as number) || 0;
        const hits = (t.hits as number) || 0;
        memoryHitRate = searches > 0 ? Math.round((hits / searches) * 1000) / 10 : 0;
      } catch {
        // telemetry is best-effort
      }

      // One-shot rate for this window. Mirrors the per-period semantic of
      // tool_call_stats.one_shot_rate (sessions where edits worked without an
      // Edit→Bash→Edit retry cycle) but scoped to the window bounds. Same
      // EDIT_TOOLS / Bash detection as tool-calls.ts; computed inline here so
      // the previous-window read doesn't have to round-trip through that
      // module's scalar entry point. Best-effort: a missing tool_calls table
      // (older TeamDO upgrade) leaves the field null instead of failing the
      // whole period query.
      const oneShotRate = queryWindowOneShotRate(sql, scope, offsetStart, offsetEnd);

      // Hourly-completion median across qualified hours. Reuses the same
      // hourly-bucket computation that hourly_effectiveness exposes for the
      // current window; the previous window has no other source for this
      // value. Local-TZ bucketing is intentionally skipped here - the
      // window-vs-window delta is structural, not display-tz, and dragging
      // tzOffsetMinutes into period_comparison would add a parameter that
      // the rest of this query does not respect.
      const qualifiedHourMedian = queryWindowQualifiedHourMedian(
        sql,
        scope,
        offsetStart,
        offsetEnd,
      );

      return {
        completion_rate: Math.round((completed / total) * 1000) / 10,
        avg_duration_min: (r.avg_duration_min as number) || 0,
        stuckness_rate: Math.round((stuck / total) * 1000) / 10,
        memory_hit_rate: memoryHitRate,
        edit_velocity: totalHours > 0 ? Math.round((totalEdits / totalHours) * 10) / 10 : 0,
        total_sessions: total,
        // Cost fields are populated downstream by enrichPeriodComparisonCost
        // in dos/team/index.ts (getAnalytics + getAnalyticsForOwner), which
        // prices the current + previous window aggregates against today's
        // pricing snapshot. Null here is the pre-enrichment placeholder -
        // any code path that skips enrichment will see em-dashes in the UI.
        total_estimated_cost_usd: null,
        total_edits_in_token_sessions: 0,
        cost_per_edit: null,
        one_shot_rate: oneShotRate,
        qualified_hour_completion_median: qualifiedHourMedian,
      };
    } catch (err) {
      log.warn(`periodMetrics query failed: ${err}`);
      return null;
    }
  }

  const current = queryPeriodMetrics(effectiveDays, 0);
  const previous = queryPeriodMetrics(effectiveDays * 2, effectiveDays);

  return {
    current: current || {
      completion_rate: 0,
      avg_duration_min: 0,
      stuckness_rate: 0,
      memory_hit_rate: 0,
      edit_velocity: 0,
      total_sessions: 0,
      // Structural placeholders - see note on queryPeriodMetrics return.
      total_estimated_cost_usd: null,
      total_edits_in_token_sessions: 0,
      cost_per_edit: null,
      one_shot_rate: null,
      qualified_hour_completion_median: null,
    },
    previous,
  };
}

// One-shot rate for an arbitrary window. Same retry detection logic as
// tool-calls.ts:queryToolCallStats - retry = Edit followed by Bash followed
// by Edit. Returns null when the window has no sessions with edits or when
// the tool_calls table itself is missing.
function queryWindowOneShotRate(
  sql: SqlStorage,
  scope: AnalyticsScope,
  offsetStart: number,
  offsetEnd: number,
): number | null {
  try {
    const { sql: q, params } = withScope(
      `SELECT session_id, tool FROM tool_calls
         WHERE called_at > datetime('now', '-' || ? || ' days')
           AND called_at <= datetime('now', '-' || ? || ' days')`,
      [offsetStart, offsetEnd],
      scope,
    );
    const sessionCalls = sql.exec(`${q} ORDER BY session_id, called_at ASC`, ...params).toArray();

    const bySession = new Map<string, string[]>();
    for (const raw of sessionCalls) {
      const r = raw as Record<string, unknown>;
      const sid = (r.session_id as string) || '';
      const tool = (r.tool as string) || '';
      if (!sid) continue;
      const list = bySession.get(sid) ?? [];
      list.push(tool);
      bySession.set(sid, list);
    }

    let oneShot = 0;
    let withEdits = 0;
    for (const tools of bySession.values()) {
      const hasEdit = tools.some((t) => EDIT_TOOLS.includes(t));
      if (!hasEdit) continue;
      withEdits++;
      let sawEditBeforeBash = false;
      let sawBashAfterEdit = false;
      let retries = 0;
      for (const t of tools) {
        if (EDIT_TOOLS.includes(t)) {
          if (sawBashAfterEdit) retries++;
          sawEditBeforeBash = true;
          sawBashAfterEdit = false;
        }
        if (t === 'Bash' && sawEditBeforeBash) {
          sawBashAfterEdit = true;
        }
      }
      if (retries === 0) oneShot++;
    }

    if (withEdits === 0) return null;
    return Math.round((oneShot / withEdits) * 100);
  } catch (err) {
    log.warn(`windowOneShotRate query failed: ${err}`);
    return null;
  }
}

// Median completion rate across qualified hours (sessions > 0) for an
// arbitrary window. Returns null when fewer than QUALIFIED_HOUR_MIN hours
// landed in the window so a thin denominator can't produce a noisy median.
function queryWindowQualifiedHourMedian(
  sql: SqlStorage,
  scope: AnalyticsScope,
  offsetStart: number,
  offsetEnd: number,
): number | null {
  try {
    const { sql: q, params } = withScope(
      `SELECT
           CAST(strftime('%H', started_at) AS INTEGER) AS hour,
           COUNT(*) AS sessions,
           ROUND(CAST(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(*), 0) * 100, 1) AS completion_rate
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND started_at <= datetime('now', '-' || ? || ' days')`,
      [offsetStart, offsetEnd],
      scope,
    );
    const rows = sql.exec(`${q} GROUP BY hour HAVING sessions > 0`, ...params).toArray();
    if (rows.length < QUALIFIED_HOUR_MIN) return null;
    const rates = rows
      .map((raw) => {
        const r = raw as Record<string, unknown>;
        const v = r.completion_rate;
        return typeof v === 'number' ? v : 0;
      })
      .sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    const lo = rates[mid - 1] ?? 0;
    const hi = rates[mid] ?? 0;
    const median = rates.length % 2 === 0 ? (lo + hi) / 2 : hi;
    return Math.round(median * 10) / 10;
  } catch (err) {
    log.warn(`windowQualifiedHourMedian query failed: ${err}`);
    return null;
  }
}
