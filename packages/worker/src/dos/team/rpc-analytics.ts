import type { DOError } from '../../types.js';
import { isDOError } from '../../lib/errors.js';
import {
  getAnalytics as getAnalyticsFn,
  getExtendedAnalytics as getExtendedAnalyticsFn,
} from './analytics/index.js';
import { getBillingBlocksForOwner as getBillingBlocksForOwnerFn } from './analytics/billing-blocks.js';
import { queryDailyTokenUsage, queryTokenAggregateForWindow } from './analytics/tokens.js';
import { queryTeamSummary } from './context.js';
import { getSessionsInRange as getSessionsInRangeFn, type SessionRecord } from './sessions.js';
import {
  enrichAnalyticsWithPricing,
  enrichDailyTrendsWithPricing,
  enrichPeriodComparisonCost,
} from '../../lib/pricing-enrich.js';
import { type RpcCtx, withMember, withOwner } from './rpc-context.js';

// Token-usage pricing enrichment pattern shared by getAnalytics +
// getAnalyticsForOwner. Enriches in place and returns the same payload.
// Expressed as an async helper so both callers pick up future enrichment
// changes uniformly.
async function enrichFullAnalytics<
  T extends
    | Awaited<ReturnType<typeof getAnalyticsFn>>
    | Awaited<ReturnType<typeof getExtendedAnalyticsFn>>,
>(ctx: RpcCtx, raw: T, days: number, tzOffsetMinutes: number): Promise<T> {
  // Enrich token_usage with cost from the isolate pricing cache. This hits
  // DatabaseDO at most once per TTL window (5 min) rather than per request.
  const enriched = (await enrichAnalyticsWithPricing(raw, ctx.env)) as T;
  // Per-day cost on daily_trends: same pricing snapshot, one extra SQL
  // aggregate. Fills the Trend widget's cost and cost-per-edit lines with
  // honest per-day numbers instead of the "daily cost not captured"
  // placeholder. Reliability gates mirror the period total.
  const dailyTokens = queryDailyTokenUsage(ctx.sql, days, tzOffsetMinutes);
  await enrichDailyTrendsWithPricing(enriched.daily_trends, dailyTokens, ctx.env);
  // Period-comparison cost: price both windows against the CURRENT pricing
  // snapshot so the cost-per-edit delta shown by CostPerEditWidget reflects
  // behavior change, not price drift. Previous-window aggregate falls to
  // empty when outside retention (30d default), which computeWindowCost
  // maps to a null cost — StatWidget's delta gate then skips rendering.
  const currentAgg = queryTokenAggregateForWindow(ctx.sql, days, 0);
  const previousAgg = queryTokenAggregateForWindow(ctx.sql, days * 2, days);
  await enrichPeriodComparisonCost(enriched, currentAgg, previousAgg, ctx.env);
  return enriched;
}

export async function getAnalyticsRpc(
  ctx: RpcCtx,
  agentId: string,
  days: number,
  ownerId: string | null = null,
  extended = false,
  tzOffsetMinutes: number = 0,
): Promise<
  ReturnType<typeof getAnalyticsFn> | ReturnType<typeof getExtendedAnalyticsFn> | DOError
> {
  const raw = withMember(ctx, agentId, ownerId, () =>
    extended
      ? getExtendedAnalyticsFn(ctx.sql, days, tzOffsetMinutes)
      : getAnalyticsFn(ctx.sql, days, tzOffsetMinutes),
  );
  if (isDOError(raw)) return raw;
  return enrichFullAnalytics(ctx, raw, days, tzOffsetMinutes);
}

export function getSessionsInRangeRpc(
  ctx: RpcCtx,
  ownerId: string,
  fromDate: string,
  toDate: string,
  filters?: { hostTool?: string; handle?: string },
): { ok: true; sessions: SessionRecord[]; truncated: boolean; total_sessions: number } | DOError {
  return withOwner(ctx, ownerId, () => {
    const result = getSessionsInRangeFn(ctx.sql, fromDate, toDate, filters);
    return { ok: true as const, ...result };
  });
}

export async function getAnalyticsForOwnerRpc(
  ctx: RpcCtx,
  ownerId: string,
  days: number,
  tzOffsetMinutes: number = 0,
): Promise<ReturnType<typeof getExtendedAnalyticsFn> | DOError> {
  const gate = withOwner(ctx, ownerId, () =>
    getExtendedAnalyticsFn(ctx.sql, days, tzOffsetMinutes),
  );
  if (isDOError(gate)) return gate;
  return enrichFullAnalytics(ctx, gate, days, tzOffsetMinutes);
}

export function getSummaryRpc(
  ctx: RpcCtx,
  ownerId: string,
): ReturnType<typeof queryTeamSummary> | DOError {
  return withOwner(ctx, ownerId, () => {
    ctx.maybeCleanup();
    return queryTeamSummary(ctx.sql);
  });
}

/**
 * Return the caller's billing-block history for this team's sessions.
 * Scoped by `ownerId` (the caller's user id) so a single user gets
 * their own window state regardless of which agent they were using —
 * the Anthropic limit is billed to the account, not the session.
 *
 * When chinmeister eventually grows a cross-team aggregator for Pro
 * windows, this DO method is the per-team primitive it should call.
 * Today, multi-team users get per-team views; the algorithm itself
 * works on any pre-collected event stream so merging across teams is
 * a route-level concern, not a DO change.
 */
export function getBillingBlocksRpc(
  ctx: RpcCtx,
  ownerId: string,
): ReturnType<typeof getBillingBlocksForOwnerFn> | DOError {
  return withOwner(ctx, ownerId, () => getBillingBlocksForOwnerFn(ctx.sql, ownerId));
}
