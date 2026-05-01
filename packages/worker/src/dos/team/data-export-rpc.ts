// Per-user data export and erasure RPC bodies (GDPR Art. 15 / Art. 17).
//
// Both methods take the caller's handle (not just owner_id) because every
// per-user table in the team schema carries handle as the user-facing
// identifier. Owner_id is used to gate the call (the caller must be on
// the team) but the filter is by handle.

import type { DOResult } from '../../types.js';
import { isDOError } from '../../lib/errors.js';
import {
  exportForHandle as exportForHandleFn,
  deleteForHandle as deleteForHandleFn,
  type UserDataExport,
  type UserDataDeletionResult,
} from './data-export.js';
import type { RpcCtx } from './rpc-ctx.js';

export async function rpcExportUserData(
  ctx: RpcCtx,
  ownerId: string,
  handle: string,
): Promise<DOResult<{ ok: true; data: UserDataExport }>> {
  const gate = ctx.withOwner(ownerId, () => true);
  if (isDOError(gate)) return gate;
  return { ok: true, data: exportForHandleFn(ctx.sql, handle) };
}

export async function rpcDeleteUserData(
  ctx: RpcCtx,
  ownerId: string,
  handle: string,
): Promise<DOResult<{ ok: true; result: UserDataDeletionResult }>> {
  const gate = ctx.withOwner(ownerId, () => true);
  if (isDOError(gate)) return gate;
  const result = deleteForHandleFn(ctx.sql, handle, ctx.transact);
  // Erasure removes members, activities, locks, memories, sessions, all of
  // which feed queryTeamContext. Bust the cache and notify watchers so live
  // dashboards drop the deleted user immediately.
  ctx.broadcastToWatchers({ type: 'user_data_deleted', handle });
  return { ok: true, result };
}
