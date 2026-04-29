/**
 * Schema-defaults invariant for the consolidated analytics contract.
 *
 * The web copy of these schemas was deleted in favor of the shared schemas in
 * @chinmeister/shared/contracts/analytics.js. The shared schemas now carry
 * every default the consumer needs, so a payload missing optional fields
 * still parses to a usable shape. This test pins that contract:
 *
 *   1. userAnalyticsSchema.parse({ ok: true }) succeeds (defaults fill in).
 *   2. teamAnalyticsSchema.parse({ ok: true }) succeeds (defaults fill in).
 *   3. The set of fields that REQUIRE explicit input is small and listed,
 *      so adding a new required field forces a deliberate choice rather
 *      than silently breaking older producers.
 *   4. total_estimated_cost_usd accepts null on every consumer that touches
 *      it. This is the active drift bug from before the consolidation: the
 *      web schema had `z.number().default(0)`, which rejected null and
 *      caused validateResponse to drop the entire response.
 */
import { describe, it, expect } from 'vitest';
import {
  teamAnalyticsSchema,
  userAnalyticsSchema,
  tokenUsageStatsSchema,
  periodMetricsSchema,
  dailyTrendSchema,
} from '@chinmeister/shared/contracts/analytics.js';

describe('analytics schema defaults', () => {
  it('teamAnalyticsSchema parses a minimal envelope with defaults', () => {
    const result = teamAnalyticsSchema.safeParse({ ok: true });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const v = result.data;
    expect(v.ok).toBe(true);
    expect(v.file_heatmap).toEqual([]);
    expect(v.daily_trends).toEqual([]);
    expect(v.tool_distribution).toEqual([]);
    expect(v.outcome_distribution).toEqual([]);
    expect(v.daily_metrics).toEqual([]);
    expect(v.files_touched_total).toBe(0);
    expect(v.files_touched_half_split).toBeNull();
  });

  it('userAnalyticsSchema parses a minimal envelope with defaults', () => {
    const result = userAnalyticsSchema.safeParse({ ok: true });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const v = result.data;
    // Inherited from teamAnalyticsSchema.
    expect(v.daily_trends).toEqual([]);
    expect(v.tool_distribution).toEqual([]);
    // User-only arrays.
    expect(v.hourly_distribution).toEqual([]);
    expect(v.member_analytics).toEqual([]);
    expect(v.member_analytics_total).toBe(0);
    expect(v.tool_handoffs).toEqual([]);
    expect(v.scope_complexity).toEqual([]);
    expect(v.confused_files).toEqual([]);
    // User-only object defaults.
    expect(v.completion_summary.total_sessions).toBe(0);
    expect(v.completion_summary.prev_completion_rate).toBeNull();
    expect(v.token_usage.total_estimated_cost_usd).toBeNull();
    expect(v.token_usage.cost_per_edit).toBeNull();
    expect(v.token_usage.cache_hit_rate).toBeNull();
    expect(v.period_comparison.current.total_estimated_cost_usd).toBeNull();
    expect(v.period_comparison.current.cost_per_edit).toBeNull();
    expect(v.period_comparison.previous).toBeNull();
    expect(v.commit_stats.total_commits).toBe(0);
    expect(v.commit_stats.avg_time_to_first_commit_min).toBeNull();
    expect(v.tool_call_stats.host_one_shot).toEqual([]);
    expect(v.memory_usage.total_memories).toBe(0);
    expect(v.memory_usage.formation_observations_by_recommendation.keep).toBe(0);
    expect(v.memory_aging.recent_7d).toBe(0);
    expect(v.degraded).toBe(false);
    expect(v.teams_included).toBe(0);
  });

  // The fields below are the FINITE list of inputs that the consumer cannot
  // synthesize a default for. If a future PR adds a required field anywhere
  // in this surface, this list grows and the test fails - that is the
  // intended forcing function. Either give the new field a default in
  // shared/contracts/analytics.ts, or add it here with a justification.
  it('userAnalyticsSchema requires only `ok` at the envelope level', () => {
    // Envelope-level required fields. `period_days` defaults to 0 so a
    // producer that omits it is treated as a degenerate empty window
    // rather than dropped.
    const minimal = userAnalyticsSchema.safeParse({ ok: true });
    expect(minimal.success).toBe(true);

    // Drop ok → fail.
    const noOk = userAnalyticsSchema.safeParse({});
    expect(noOk.success).toBe(false);

    // Wrong ok value → fail.
    const wrongOk = userAnalyticsSchema.safeParse({ ok: false });
    expect(wrongOk.success).toBe(false);
  });

  it('total_estimated_cost_usd is nullable across every consumer', () => {
    // tokenUsageStatsSchema: worker emits null when pricing is stale or
    // when every observed model is unpriced. The pre-consolidation web
    // schema had this as z.number().default(0), which threw away the
    // whole response on null.
    const tu = tokenUsageStatsSchema.safeParse({ total_estimated_cost_usd: null });
    expect(tu.success).toBe(true);
    if (tu.success) {
      expect(tu.data.total_estimated_cost_usd).toBeNull();
    }

    // periodMetricsSchema: same null path through the period comparison
    // enrich step.
    const pm = periodMetricsSchema.safeParse({
      total_estimated_cost_usd: null,
      cost_per_edit: null,
    });
    expect(pm.success).toBe(true);
    if (pm.success) {
      expect(pm.data.total_estimated_cost_usd).toBeNull();
      expect(pm.data.cost_per_edit).toBeNull();
    }

    // Sanity: a numeric value also parses.
    const numeric = tokenUsageStatsSchema.safeParse({ total_estimated_cost_usd: 1.23 });
    expect(numeric.success).toBe(true);
    if (numeric.success) {
      expect(numeric.data.total_estimated_cost_usd).toBe(1.23);
    }
  });

  it('dailyTrendSchema cost fields default to null when omitted', () => {
    const result = dailyTrendSchema.safeParse({ day: '2026-04-29' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sessions).toBe(0);
    expect(result.data.cost).toBeNull();
    expect(result.data.cost_per_edit).toBeNull();
  });
});
