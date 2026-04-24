import type {
  ConversationAnalytics,
  SessionConversationStats,
} from '@chinmeister/shared/contracts/conversation.js';
import type { DOError } from '../../types.js';
import {
  batchRecordConversationEvents as batchRecordConversationEventsFn,
  getConversationForSession as getConversationForSessionFn,
  getConversationAnalytics as getConversationAnalyticsFn,
  getSessionConversationStats as getSessionConversationStatsFn,
  type ConversationEventInput,
} from './conversations.js';
import { type RpcCtx, op, withMember } from './rpc-context.js';

export function recordConversationEventsRpc(
  ctx: RpcCtx,
  agentId: string,
  sessionId: string,
  handle: string,
  hostTool: string,
  events: ConversationEventInput[],
  ownerId: string | null = null,
): { ok: true; count: number } | DOError {
  return op(
    ctx,
    agentId,
    ownerId,
    () =>
      batchRecordConversationEventsFn(
        ctx.sql,
        sessionId,
        agentId,
        handle,
        hostTool,
        events,
        ctx.transact,
      ),
    { metric: () => 'conversation_events_recorded' },
  );
}

export function getConversationRpc(
  ctx: RpcCtx,
  agentId: string,
  sessionId: string,
  ownerId: string | null = null,
): ReturnType<typeof getConversationForSessionFn> | DOError {
  return withMember(ctx, agentId, ownerId, () => getConversationForSessionFn(ctx.sql, sessionId));
}

export function getConversationAnalyticsRpc(
  ctx: RpcCtx,
  agentId: string,
  days: number,
  ownerId: string | null = null,
): ConversationAnalytics | DOError {
  return withMember(ctx, agentId, ownerId, () => getConversationAnalyticsFn(ctx.sql, days));
}

export function getSessionConversationStatsRpc(
  ctx: RpcCtx,
  agentId: string,
  sessionIds: string[],
  ownerId: string | null = null,
): { ok: true; stats: SessionConversationStats[] } | DOError {
  return withMember(ctx, agentId, ownerId, () => ({
    ok: true as const,
    stats: getSessionConversationStatsFn(ctx.sql, sessionIds),
  }));
}
