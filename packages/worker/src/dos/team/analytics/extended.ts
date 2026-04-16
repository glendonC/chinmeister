// Extended analytics: prompt efficiency, hourly effectiveness, outcome tags, tool handoffs.

import { createLogger } from '../../../lib/logger.js';
import type {
  PromptEfficiencyTrend,
  HourlyEffectiveness,
  OutcomeTagCount,
  ToolHandoff,
} from '@chinwag/shared/contracts/analytics.js';

const log = createLogger('TeamDO.analytics');

export function queryPromptEfficiency(sql: SqlStorage, days: number): PromptEfficiencyTrend[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           date(ce.created_at) AS day,
           ROUND(
             CAST(SUM(CASE WHEN ce.role = 'user' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(AVG(s.edit_count), 0),
           1) AS avg_turns_per_edit,
           COUNT(DISTINCT s.id) AS sessions
         FROM conversation_events ce
         JOIN sessions s ON s.id = ce.session_id
         WHERE ce.created_at > datetime('now', '-' || ? || ' days')
           AND s.edit_count > 0
         GROUP BY date(ce.created_at)
         ORDER BY day ASC`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        day: row.day as string,
        avg_turns_per_edit: (row.avg_turns_per_edit as number) || 0,
        sessions: (row.sessions as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`promptEfficiency query failed: ${err}`);
    return [];
  }
}

export function queryHourlyEffectiveness(sql: SqlStorage, days: number): HourlyEffectiveness[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           CAST(strftime('%H', started_at) AS INTEGER) AS hour,
           COUNT(*) AS sessions,
           ROUND(CAST(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(*), 0) * 100, 1) AS completion_rate,
           ROUND(AVG(edit_count), 1) AS avg_edits
         FROM sessions
         WHERE started_at > datetime('now', '-' || ? || ' days')
         GROUP BY hour
         ORDER BY hour`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        hour: (row.hour as number) || 0,
        sessions: (row.sessions as number) || 0,
        completion_rate: (row.completion_rate as number) || 0,
        avg_edits: (row.avg_edits as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`hourlyEffectiveness query failed: ${err}`);
    return [];
  }
}

export function queryOutcomeTags(sql: SqlStorage, days: number): OutcomeTagCount[] {
  try {
    const rows = sql
      .exec(
        `SELECT
           value AS tag,
           COALESCE(outcome, 'unknown') AS outcome,
           COUNT(*) AS count
         FROM sessions, json_each(sessions.outcome_tags)
         WHERE started_at > datetime('now', '-' || ? || ' days')
           AND outcome_tags != '[]'
         GROUP BY tag, outcome
         ORDER BY count DESC
         LIMIT 30`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        tag: row.tag as string,
        outcome: row.outcome as string,
        count: (row.count as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`outcomeTags query failed: ${err}`);
    return [];
  }
}

export function queryToolHandoffs(sql: SqlStorage, days: number): ToolHandoff[] {
  try {
    // Find files touched by different tools within 24h windows
    const rows = sql
      .exec(
        `SELECT
           a.host_tool AS from_tool,
           b.host_tool AS to_tool,
           COUNT(DISTINCT a.file_path) AS file_count,
           ROUND(CAST(SUM(CASE WHEN s.outcome = 'completed' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1) AS handoff_completion_rate
         FROM edits a
         JOIN edits b ON a.file_path = b.file_path
           AND b.created_at > a.created_at
           AND b.created_at < datetime(a.created_at, '+1 day')
           AND a.host_tool != b.host_tool
         JOIN sessions s ON s.id = b.session_id
         WHERE a.created_at > datetime('now', '-' || ? || ' days')
         GROUP BY from_tool, to_tool
         HAVING file_count >= 2
         ORDER BY file_count DESC
         LIMIT 10`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        from_tool: row.from_tool as string,
        to_tool: row.to_tool as string,
        file_count: (row.file_count as number) || 0,
        handoff_completion_rate: (row.handoff_completion_rate as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`toolHandoffs query failed: ${err}`);
    return [];
  }
}
