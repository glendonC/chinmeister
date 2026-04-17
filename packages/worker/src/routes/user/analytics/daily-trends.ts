// daily_trends: per-day sessions/edits/duration across teams.
// Scoped to its own module because avg_duration_min is a weighted average
// (sum of avg*sessions / sum of sessions) that every consumer must compute
// the same way.

import type { DailyTrend } from '@chinwag/shared/contracts/analytics.js';
import type { TeamResult } from './types.js';

interface DailyTrendBucket {
  sessions: number;
  edits: number;
  lines_added: number;
  lines_removed: number;
  duration_sum: number;
  duration_count: number;
  completed: number;
  abandoned: number;
  failed: number;
}

export type DailyTrendsAcc = Map<string, DailyTrendBucket>;

export function createAcc(): DailyTrendsAcc {
  return new Map();
}

export function merge(acc: DailyTrendsAcc, team: TeamResult): void {
  for (const t of team.daily_trends ?? []) {
    const existing = acc.get(t.day) ?? {
      sessions: 0,
      edits: 0,
      lines_added: 0,
      lines_removed: 0,
      duration_sum: 0,
      duration_count: 0,
      completed: 0,
      abandoned: 0,
      failed: 0,
    };
    existing.sessions += t.sessions;
    existing.edits += t.edits;
    existing.lines_added += t.lines_added;
    existing.lines_removed += t.lines_removed;
    existing.duration_sum += t.avg_duration_min * t.sessions;
    existing.duration_count += t.sessions;
    existing.completed += t.completed ?? 0;
    existing.abandoned += t.abandoned ?? 0;
    existing.failed += t.failed ?? 0;
    acc.set(t.day, existing);
  }
}

export function project(acc: DailyTrendsAcc): DailyTrend[] {
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({
      day,
      sessions: v.sessions,
      edits: v.edits,
      lines_added: v.lines_added,
      lines_removed: v.lines_removed,
      avg_duration_min:
        v.duration_count > 0 ? Math.round((v.duration_sum / v.duration_count) * 10) / 10 : 0,
      completed: v.completed,
      abandoned: v.abandoned,
      failed: v.failed,
    }));
}
