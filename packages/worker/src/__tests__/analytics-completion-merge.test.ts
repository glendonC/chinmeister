import { describe, it, expect } from 'vitest';

import {
  createCompletionAcc,
  mergeCompletion,
  projectCompletion,
} from '../routes/user/analytics/outcomes.js';
import type { TeamResult } from '../routes/user/analytics/types.js';

// Worked example from Batch 4 / Finding #4. Two teams with mismatched
// previous- and current-window denominators. The bug this test guards
// against is the old "weight previous by current total" approximation,
// which produces the wrong cross-team prev_completion_rate any time
// previous and current sample sizes diverge across teams (every
// growing or shrinking user).
//
//   Team A: prev 100 sessions at 60%, current 80 sessions at 75%
//   Team B: prev 200 sessions at 40%, current 50 sessions at 50%
//
// Correct merged previous = (100*0.60 + 200*0.40) / (100+200) = 46.67%
// Correct merged current  = (80*0.75 + 50*0.50)  / (80+50)   = 65.38%
// Broken (old) previous would weight by current totals:
//   (80*0.60 + 50*0.40) / (80+50) = 53.85% - wrong, and the wrongness
//   grows with the divergence between prev and current volumes.
function makeTeamResult(
  total: number,
  completionRate: number,
  prevTotal: number,
  prevRate: number,
): TeamResult {
  const completed = Math.round((completionRate / 100) * total);
  return {
    completion_summary: {
      total_sessions: total,
      completed,
      abandoned: 0,
      failed: 0,
      unknown: 0,
      completion_rate: completionRate,
      prev_completion_rate: prevRate,
      prev_total_sessions: prevTotal,
    },
  };
}

describe('cross-team completion merge', () => {
  it('weights previous-period completion by prev_total_sessions, not current_total', () => {
    const acc = createCompletionAcc();

    // Team A: prev 100 @ 60%, current 80 @ 75%
    mergeCompletion(acc, makeTeamResult(80, 75, 100, 60));
    // Team B: prev 200 @ 40%, current 50 @ 50%
    mergeCompletion(acc, makeTeamResult(50, 50, 200, 40));

    const merged = projectCompletion(acc);

    // Current: weighted by current totals
    //   80 * 0.75 = 60 completed
    //   50 * 0.50 = 25 completed
    //   (60 + 25) / (80 + 50) = 85 / 130 = 65.38%
    expect(merged.total_sessions).toBe(130);
    expect(merged.completed).toBe(85);
    expect(merged.completion_rate).toBeCloseTo(65.4, 1);

    // Previous: weighted by previous totals (prev_total_sessions)
    //   100 * 0.60 = 60 completed
    //   200 * 0.40 = 80 completed
    //   (60 + 80) / (100 + 200) = 140 / 300 = 46.67%
    expect(merged.prev_total_sessions).toBe(300);
    expect(merged.prev_completion_rate).toBeCloseTo(46.7, 1);

    // Sanity: the broken approximation would have produced ~53.85% by
    // re-using current totals. Anything inside [50, 60] would mean the
    // old weighting still applies. Tighten the gate to <=50 so a future
    // regression to the simple-average bug shows up.
    expect(merged.prev_completion_rate!).toBeLessThan(50);
  });

  it('emits prev_completion_rate=null when no team contributed a previous window', () => {
    const acc = createCompletionAcc();
    mergeCompletion(acc, {
      completion_summary: {
        total_sessions: 10,
        completed: 5,
        abandoned: 0,
        failed: 0,
        unknown: 0,
        completion_rate: 50,
        prev_completion_rate: null,
        prev_total_sessions: 0,
      },
    });
    const merged = projectCompletion(acc);
    expect(merged.prev_completion_rate).toBeNull();
    expect(merged.prev_total_sessions).toBe(0);
  });

  it('skips teams with prev_total_sessions=0 even if prev_completion_rate is non-null', () => {
    // Belt-and-braces guard: if a producer ships prev_completion_rate
    // without a denominator (older payload, edge case), the merge must
    // not divide-by-zero or fabricate a rate. The acc stays empty and
    // the merged previous is null.
    const acc = createCompletionAcc();
    mergeCompletion(acc, {
      completion_summary: {
        total_sessions: 10,
        completed: 5,
        abandoned: 0,
        failed: 0,
        unknown: 0,
        completion_rate: 50,
        prev_completion_rate: 60,
        prev_total_sessions: 0,
      },
    });
    const merged = projectCompletion(acc);
    expect(merged.prev_completion_rate).toBeNull();
    expect(merged.prev_total_sessions).toBe(0);
  });

  it('treats an undefined prev_total_sessions as zero (defaulted older payload)', () => {
    // Schema default is 0; older serialized rows that drop the field
    // entirely should also be treated as "no denominator" rather than
    // fabricating a rate.
    const acc = createCompletionAcc();
    mergeCompletion(acc, {
      completion_summary: {
        total_sessions: 10,
        completed: 5,
        abandoned: 0,
        failed: 0,
        unknown: 0,
        completion_rate: 50,
        prev_completion_rate: 60,
        // prev_total_sessions intentionally omitted
      } as TeamResult['completion_summary'],
    });
    const merged = projectCompletion(acc);
    expect(merged.prev_completion_rate).toBeNull();
    expect(merged.prev_total_sessions).toBe(0);
  });
});
