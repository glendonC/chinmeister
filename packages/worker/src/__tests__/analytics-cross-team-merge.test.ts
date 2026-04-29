import { describe, it, expect } from 'vitest';

import * as dailyTrends from '../routes/user/analytics/daily-trends.js';
import * as outcomes from '../routes/user/analytics/outcomes.js';
import * as tokens from '../routes/user/analytics/tokens.js';
import * as members from '../routes/user/analytics/members.js';
import type { TeamResult } from '../routes/user/analytics/types.js';

// Cross-team merge integration. The focused completion-merge suite covers the
// prev-rate weighting trap; this one fans three teams across enough fields to
// exercise the broader merge surface in one pass: daily_trends, completion
// rollups, token totals, and member rollups.
//
// Each team brings a distinct shape so a regression in any single accumulator
// will show up as a numeric disagreement, not a silent zero.

function teamA(): TeamResult {
  return {
    daily_trends: [
      {
        day: 'day-1',
        sessions: 4,
        edits: 12,
        lines_added: 80,
        lines_removed: 20,
        avg_duration_min: 10,
        completed: 3,
        abandoned: 1,
        failed: 0,
        cost: 0.5,
        cost_per_edit: null,
      },
      {
        day: 'day-2',
        sessions: 2,
        edits: 6,
        lines_added: 30,
        lines_removed: 5,
        avg_duration_min: 20,
        completed: 2,
        abandoned: 0,
        failed: 0,
        cost: 0.25,
        cost_per_edit: null,
      },
    ],
    completion_summary: {
      total_sessions: 6,
      completed: 5,
      abandoned: 1,
      failed: 0,
      unknown: 0,
      completion_rate: 83.3,
      prev_completion_rate: 50,
      prev_total_sessions: 4,
    },
    token_usage: {
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_cache_read_tokens: 0,
      total_cache_creation_tokens: 0,
      avg_input_per_session: 200,
      avg_output_per_session: 100,
      sessions_with_token_data: 5,
      sessions_without_token_data: 1,
      total_edits_in_token_sessions: 18,
      total_estimated_cost_usd: null,
      pricing_refreshed_at: null,
      pricing_is_stale: false,
      models_without_pricing: [],
      models_without_pricing_total: 0,
      cost_per_edit: null,
      cache_hit_rate: null,
      by_model: [
        {
          agent_model: 'claude-sonnet',
          input_tokens: 800,
          output_tokens: 400,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          sessions: 4,
          estimated_cost_usd: null,
        },
      ],
      by_tool: [
        {
          host_tool: 'claude-code',
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          sessions: 5,
        },
      ],
    },
    member_analytics: [
      {
        handle: 'ada',
        sessions: 4,
        completed: 3,
        completion_rate: 75,
        total_edits: 12,
        primary_tool: 'claude-code',
        total_session_hours: 1.5,
      },
      {
        handle: 'nova',
        sessions: 2,
        completed: 2,
        completion_rate: 100,
        total_edits: 6,
        primary_tool: 'claude-code',
        total_session_hours: 0.6,
      },
    ],
  } as unknown as TeamResult;
}

function teamB(): TeamResult {
  return {
    daily_trends: [
      {
        day: 'day-2',
        sessions: 3,
        edits: 9,
        lines_added: 40,
        lines_removed: 10,
        avg_duration_min: 14,
        completed: 1,
        abandoned: 1,
        failed: 1,
        cost: 0.75,
        cost_per_edit: null,
      },
      {
        day: 'day-3',
        sessions: 5,
        edits: 15,
        lines_added: 70,
        lines_removed: 30,
        avg_duration_min: 8,
        completed: 4,
        abandoned: 1,
        failed: 0,
        cost: 1,
        cost_per_edit: null,
      },
    ],
    completion_summary: {
      total_sessions: 8,
      completed: 5,
      abandoned: 2,
      failed: 1,
      unknown: 0,
      completion_rate: 62.5,
      prev_completion_rate: 70,
      prev_total_sessions: 10,
    },
    token_usage: {
      total_input_tokens: 2000,
      total_output_tokens: 800,
      total_cache_read_tokens: 200,
      total_cache_creation_tokens: 100,
      avg_input_per_session: 250,
      avg_output_per_session: 100,
      sessions_with_token_data: 8,
      sessions_without_token_data: 0,
      total_edits_in_token_sessions: 24,
      total_estimated_cost_usd: null,
      pricing_refreshed_at: null,
      pricing_is_stale: false,
      models_without_pricing: [],
      models_without_pricing_total: 0,
      cost_per_edit: null,
      cache_hit_rate: null,
      by_model: [
        {
          agent_model: 'claude-sonnet',
          input_tokens: 1500,
          output_tokens: 600,
          cache_read_tokens: 200,
          cache_creation_tokens: 100,
          sessions: 6,
          estimated_cost_usd: null,
        },
        {
          agent_model: 'gpt-5',
          input_tokens: 500,
          output_tokens: 200,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          sessions: 2,
          estimated_cost_usd: null,
        },
      ],
      by_tool: [
        {
          host_tool: 'cursor',
          input_tokens: 2000,
          output_tokens: 800,
          cache_read_tokens: 200,
          cache_creation_tokens: 100,
          sessions: 8,
        },
      ],
    },
    member_analytics: [
      {
        handle: 'ada',
        sessions: 3,
        completed: 2,
        completion_rate: 66.7,
        total_edits: 9,
        primary_tool: 'cursor',
        total_session_hours: 0.7,
      },
      {
        handle: 'sky',
        sessions: 5,
        completed: 3,
        completion_rate: 60,
        total_edits: 15,
        primary_tool: 'cursor',
        total_session_hours: 0.7,
      },
    ],
  } as unknown as TeamResult;
}

function teamC(): TeamResult {
  return {
    daily_trends: [
      {
        day: 'day-1',
        sessions: 1,
        edits: 1,
        lines_added: 5,
        lines_removed: 0,
        avg_duration_min: 4,
        completed: 0,
        abandoned: 0,
        failed: 1,
        cost: null,
        cost_per_edit: null,
      },
    ],
    completion_summary: {
      total_sessions: 1,
      completed: 0,
      abandoned: 0,
      failed: 1,
      unknown: 0,
      completion_rate: 0,
      prev_completion_rate: null,
      prev_total_sessions: 0,
    },
    token_usage: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_read_tokens: 0,
      total_cache_creation_tokens: 0,
      avg_input_per_session: 0,
      avg_output_per_session: 0,
      sessions_with_token_data: 0,
      sessions_without_token_data: 1,
      total_edits_in_token_sessions: 0,
      total_estimated_cost_usd: null,
      pricing_refreshed_at: null,
      pricing_is_stale: false,
      models_without_pricing: [],
      models_without_pricing_total: 0,
      cost_per_edit: null,
      cache_hit_rate: null,
      by_model: [],
      by_tool: [],
    },
    member_analytics: [
      {
        handle: 'sky',
        sessions: 1,
        completed: 0,
        completion_rate: 0,
        total_edits: 1,
        primary_tool: 'codex',
        total_session_hours: 0.07,
      },
    ],
  } as unknown as TeamResult;
}

describe('cross-team merge across multiple analytic surfaces', () => {
  const teams = [teamA(), teamB(), teamC()];

  it('daily_trends sums sessions/edits/lines and preserves day overlap', () => {
    const acc = dailyTrends.createAcc();
    for (const t of teams) dailyTrends.merge(acc, t);
    const merged = dailyTrends.project(acc);

    // Day index keyed by day string for clarity.
    const byDay = Object.fromEntries(merged.map((d) => [d.day, d]));

    // day-1: A (4 sessions) + C (1 session) = 5
    expect(byDay['day-1']?.sessions).toBe(5);
    expect(byDay['day-1']?.edits).toBe(13);
    expect(byDay['day-1']?.lines_added).toBe(85);
    // C contributed null cost; A contributed 0.5; merged should equal 0.5.
    expect(byDay['day-1']?.cost).toBe(0.5);

    // day-2: A (2) + B (3) = 5; cost 0.25 + 0.75 = 1.
    expect(byDay['day-2']?.sessions).toBe(5);
    expect(byDay['day-2']?.cost).toBe(1);

    // day-3: B only.
    expect(byDay['day-3']?.sessions).toBe(5);

    // Days are sorted lexically so the merged array reads chronologically.
    expect(merged.map((d) => d.day)).toEqual(['day-1', 'day-2', 'day-3']);
  });

  it('completion_summary aggregates totals and weights prev rate by prev totals', () => {
    const acc = outcomes.createCompletionAcc();
    for (const t of teams) outcomes.mergeCompletion(acc, t);
    const merged = outcomes.projectCompletion(acc);

    // Totals: A 6 + B 8 + C 1 = 15. Completed: 5+5+0 = 10.
    expect(merged.total_sessions).toBe(15);
    expect(merged.completed).toBe(10);
    expect(merged.failed).toBe(2);
    expect(merged.completion_rate).toBeCloseTo(66.7, 1);

    // prev: A 4@50% (2 completed) + B 10@70% (7 completed) = 9 / 14 = 64.29%
    // C contributes nothing because prev_total_sessions=0.
    expect(merged.prev_total_sessions).toBe(14);
    expect(merged.prev_completion_rate).toBeCloseTo(64.3, 1);
  });

  it('token totals sum across teams with nested by_model/by_tool merging', () => {
    const acc = tokens.createAcc();
    for (const t of teams) tokens.merge(acc, t);
    const merged = tokens.project(acc);

    expect(merged.total_input_tokens).toBe(3000);
    expect(merged.total_output_tokens).toBe(1300);
    expect(merged.total_cache_read_tokens).toBe(200);
    expect(merged.sessions_with_token_data).toBe(13);
    expect(merged.sessions_without_token_data).toBe(2);

    // by_model sums claude-sonnet across A and B; gpt-5 only in B.
    const sonnet = merged.by_model.find((m) => m.agent_model === 'claude-sonnet');
    expect(sonnet?.input_tokens).toBe(2300);
    expect(sonnet?.sessions).toBe(10);
    const gpt = merged.by_model.find((m) => m.agent_model === 'gpt-5');
    expect(gpt?.input_tokens).toBe(500);

    // by_tool keeps each host_tool distinct (claude-code, cursor).
    const tools = merged.by_tool.map((t) => t.host_tool).sort();
    expect(tools).toEqual(['claude-code', 'cursor']);
  });

  it('member rollup sums per-handle activity across teams and re-derives completion_rate', () => {
    const acc = members.createAcc();
    for (const t of teams) members.merge(acc, t);
    const merged = members.project(acc);
    const byHandle = Object.fromEntries(merged.map((m) => [m.handle, m]));

    // ada appears in A and B. Sessions 4 + 3 = 7. Completed 3 + 2 = 5.
    // completion_rate is re-derived from sums, not averaged from per-team rates.
    expect(byHandle.ada?.sessions).toBe(7);
    expect(byHandle.ada?.completed).toBe(5);
    expect(byHandle.ada?.completion_rate).toBeCloseTo(71.4, 1);

    // sky appears in B and C. Sessions 5 + 1 = 6. Completed 3 + 0 = 3.
    expect(byHandle.sky?.sessions).toBe(6);
    expect(byHandle.sky?.completion_rate).toBeCloseTo(50, 1);

    // nova only in A.
    expect(byHandle.nova?.sessions).toBe(2);
  });
});
