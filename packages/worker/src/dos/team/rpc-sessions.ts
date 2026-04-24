import type { DOError, DOResult } from '../../types.js';
import {
  startSession as startSessionFn,
  endSession as endSessionFn,
  recordEdit as recordEditFn,
  reportOutcome as reportOutcomeFn,
  recordTokenUsage as recordTokenUsageFn,
  recordToolCalls as recordToolCallsFn,
  recordCommits as recordCommitsFn,
  getSessionHistory,
  getEditHistory as getEditHistoryFn,
  enrichSessionModel as enrichSessionModelFn,
  type ToolCallInput,
  type CommitInput,
  type EditEntry,
} from './sessions.js';
import { type RpcCtx, op, withMember } from './rpc-context.js';

export function startSessionRpc(
  ctx: RpcCtx,
  agentId: string,
  handle: string,
  framework: string,
  runtime: Record<string, unknown> | null = null,
  ownerId: string | null = null,
): DOResult<{ ok: true; session_id: string }> | DOError {
  return op(
    ctx,
    agentId,
    ownerId,
    (resolved) => startSessionFn(ctx.sql, resolved, handle, framework, runtime, ctx.transact),
    { metric: () => 'sessions_started' },
  );
}

export function endSessionRpc(
  ctx: RpcCtx,
  agentId: string,
  sessionId: string,
  ownerId: string | null = null,
):
  | DOResult<{ ok: true; outcome?: string | null; summary?: Record<string, unknown> | null }>
  | DOError {
  return op(ctx, agentId, ownerId, (resolved) => endSessionFn(ctx.sql, resolved, sessionId), {
    metric: (r) => (r.outcome ? `outcome:${r.outcome}` : null),
  });
}

export function recordEditRpc(
  ctx: RpcCtx,
  agentId: string,
  filePath: string,
  linesAdded = 0,
  linesRemoved = 0,
  ownerId: string | null = null,
): { ok: true; skipped?: boolean } | DOError {
  return withMember(ctx, agentId, ownerId, (resolved) =>
    recordEditFn(ctx.sql, resolved, filePath, linesAdded, linesRemoved),
  );
}

export function reportOutcomeRpc(
  ctx: RpcCtx,
  agentId: string,
  outcome: string,
  summary: string | null = null,
  ownerId: string | null = null,
  outcomeTags?: string[] | null,
): DOResult<{ ok: true }> | DOError {
  return withMember(ctx, agentId, ownerId, (resolved) =>
    reportOutcomeFn(ctx.sql, resolved, outcome, summary, outcomeTags),
  );
}

export function getHistoryRpc(
  ctx: RpcCtx,
  agentId: string,
  days: number,
  ownerId: string | null = null,
): ReturnType<typeof getSessionHistory> | DOError {
  return withMember(ctx, agentId, ownerId, () => getSessionHistory(ctx.sql, days));
}

export function getEditHistoryRpc(
  ctx: RpcCtx,
  agentId: string,
  days: number,
  filePath: string | null = null,
  handle: string | null = null,
  limit = 200,
  ownerId: string | null = null,
): { ok: true; edits: EditEntry[] } | DOError {
  return withMember(ctx, agentId, ownerId, () =>
    getEditHistoryFn(ctx.sql, days, filePath, handle, limit),
  );
}

export function enrichModelRpc(
  ctx: RpcCtx,
  agentId: string,
  model: string,
  ownerId: string | null = null,
): { ok: true } | DOError {
  return withMember(ctx, agentId, ownerId, (resolved) =>
    enrichSessionModelFn(ctx.sql, resolved, model, ctx.recordMetric, ctx.transact),
  );
}

export function recordTokenUsageRpc(
  ctx: RpcCtx,
  agentId: string,
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  ownerId: string | null = null,
): { ok: true } | DOError {
  return withMember(ctx, agentId, ownerId, (resolved) =>
    recordTokenUsageFn(
      ctx.sql,
      resolved,
      sessionId,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
    ),
  );
}

export function recordToolCallsRpc(
  ctx: RpcCtx,
  agentId: string,
  sessionId: string,
  handle: string,
  hostTool: string,
  calls: ToolCallInput[],
  ownerId: string | null = null,
): { ok: true; recorded: number } | DOError {
  return withMember(ctx, agentId, ownerId, (resolved) =>
    recordToolCallsFn(ctx.sql, resolved, sessionId, handle, hostTool, calls),
  );
}

export function recordCommitsRpc(
  ctx: RpcCtx,
  agentId: string,
  sessionId: string | null,
  handle: string,
  hostTool: string,
  commits: CommitInput[],
  ownerId: string | null = null,
): { ok: true; recorded: number } | DOError {
  return withMember(ctx, agentId, ownerId, (resolved) =>
    recordCommitsFn(ctx.sql, resolved, sessionId, handle, hostTool, commits),
  );
}
