import type { DOError } from '../../types.js';
import {
  claimFiles as claimFilesFn,
  checkFileConflicts as checkFileConflictsFn,
  releaseFiles as releaseFilesFn,
  getLockedFiles as getLockedFilesFn,
} from './locks.js';
import { type RpcCtx, op, withMember } from './rpc-context.js';

export function claimFilesRpc(
  ctx: RpcCtx,
  agentId: string,
  files: string[],
  handle: string,
  runtimeOrTool: string | Record<string, unknown> | null | undefined,
  ownerId: string | null = null,
  options: { ttlSeconds?: number } = {},
): ReturnType<typeof claimFilesFn> | DOError {
  return op(
    ctx,
    agentId,
    ownerId,
    (resolved) => claimFilesFn(ctx.sql, resolved, files, handle, runtimeOrTool, ownerId!, options),
    {
      broadcast: (_r, resolved) => ({
        type: 'lock_change',
        action: 'claim',
        agent_id: resolved,
        files,
      }),
    },
  );
}

/**
 * Read-only conflict check for a batch of concrete paths. Used by the
 * pre-commit hook and any would-be-editor that wants to know whether
 * proceeding would collide with a peer's lock (exact-path or glob
 * umbrella) without actually claiming. Globs in the input are skipped.
 */
export function checkFileConflictsRpc(
  ctx: RpcCtx,
  agentId: string,
  files: string[],
  ownerId: string | null = null,
): { ok: true; blocked: ReturnType<typeof checkFileConflictsFn> } | DOError {
  return withMember(ctx, agentId, ownerId, (resolved) => ({
    ok: true,
    blocked: checkFileConflictsFn(ctx.sql, resolved, files),
  }));
}

export function releaseFilesRpc(
  ctx: RpcCtx,
  agentId: string,
  files: string[] | null | undefined,
  ownerId: string | null = null,
): { ok: true } | DOError {
  return op(
    ctx,
    agentId,
    ownerId,
    (resolved) => releaseFilesFn(ctx.sql, resolved, files, ownerId),
    {
      broadcast: (_r, resolved) => ({
        type: 'lock_change',
        action: 'release',
        agent_id: resolved,
        files,
      }),
    },
  );
}

export function getLockedFilesRpc(
  ctx: RpcCtx,
  agentId: string,
  ownerId: string | null = null,
): ReturnType<typeof getLockedFilesFn> | DOError {
  return withMember(ctx, agentId, ownerId, () =>
    getLockedFilesFn(ctx.sql, ctx.getConnectedAgentIds()),
  );
}
