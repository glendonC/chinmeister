// Membership RPC bodies extracted from TeamDO.
//
// Pure functions over RpcCtx - see rpc-ctx.ts for the dependency shape.
// Class methods on TeamDO delegate here so the DO shell stays a thin facade
// over the hibernation-sensitive boundary.

import type { DOResult, DOError } from '../../types.js';
import { isDOError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';
import { join, leave, heartbeat as heartbeatFn } from './membership.js';
import { normalizeRuntimeMetadata } from './runtime.js';
import { MEMBERSHIP_REVOKED_CLOSE_CODE, getSocketsForAgent } from './presence.js';
import { HEARTBEAT_BROADCAST_DEBOUNCE_MS } from '../../lib/constants.js';
import type { RpcCtx } from './rpc-ctx.js';

const log = createLogger('TeamDO');

/**
 * Tear down live WebSocket subscriptions for the leaving agent before the
 * membership rows are deleted.
 *
 * Scope: only the specific `agentId` being removed. The user may own other
 * agents on this team that are not leaving (different MCP processes, dashboard
 * sockets, etc.); their sockets must stay open. This mirrors `leave()` itself,
 * which only deletes rows for the supplied agent_id under the supplied owner.
 *
 * Order matters: revoking sockets first means any in-flight `webSocketMessage`
 * handlers fire against still-present rows, and the `webSocketClose` handler's
 * `releaseFiles` runs before the row is gone (no orphaned locks).
 *
 * Sends a final `membership_revoked` JSON frame so the client can mark the
 * team gone, then closes with custom code 4001 so the client knows to stop
 * reconnecting (vs 1006 transport errors which trigger backoff retry).
 *
 * Returns nothing: this is best-effort cleanup. Any send/close failure is
 * logged and swallowed because the SQL deletion that follows is the
 * authoritative state change.
 */
function revokeMemberSockets(ctx: RpcCtx, agentId: string, reason: 'left' | 'kicked'): void {
  const sockets = getSocketsForAgent(ctx.doState, agentId);
  if (sockets.length === 0) return;
  const frame = JSON.stringify({ type: 'membership_revoked', reason });
  for (const ws of sockets) {
    try {
      ws.send(frame);
    } catch (err) {
      log.warn('membership_revoked send failed', {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      ws.close(MEMBERSHIP_REVOKED_CLOSE_CODE, 'membership_revoked');
    } catch (err) {
      log.warn('membership_revoked close failed', {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function rpcJoin(
  ctx: RpcCtx,
  agentId: string,
  ownerId: string,
  ownerHandle: string,
  runtimeOrTool: string | Record<string, unknown> | null = 'unknown',
): Promise<DOResult<{ ok: true }>> {
  ctx.ensureSchema();
  const result = join(ctx.sql, agentId, ownerId, ownerHandle, runtimeOrTool, ctx.boundRecordMetric);
  if (!isDOError(result)) {
    const tool = normalizeRuntimeMetadata(runtimeOrTool, agentId).hostTool;
    ctx.broadcastToWatchers({
      type: 'member_joined',
      agent_id: agentId,
      handle: ownerHandle,
      tool: tool || 'unknown',
    });
  }
  return result;
}

export async function rpcLeave(
  ctx: RpcCtx,
  agentId: string,
  ownerId: string | null = null,
): Promise<DOResult<{ ok: true }>> {
  ctx.ensureSchema();

  // Tear down any live WebSocket subscriptions BEFORE deleting membership rows.
  // Skipping this step lets a kicked or self-leaving agent keep receiving live
  // presence and conflict broadcasts until their client disconnects, which
  // defeats the access revocation entirely. Order:
  //   1. Send `membership_revoked` frame so the client can mark the team gone.
  //   2. Close with code 4001 (app-private, distinct from 1006 transport errors)
  //      so the client stops reconnecting.
  //   3. Then run the SQL deletion below.
  // Closing first means in-flight `webSocketMessage` handlers fire against
  // still-present rows, and the `webSocketClose` handler's `releaseFiles` runs
  // before the row is gone (no orphaned locks).
  revokeMemberSockets(ctx, agentId, 'left');

  const result = leave(ctx.sql, agentId, ownerId, ctx.transact);
  if (!isDOError(result)) {
    ctx.lastHeartbeatBroadcast.delete(agentId);
    ctx.broadcastToWatchers({ type: 'member_left', agent_id: agentId });
  }
  return result;
}

export async function rpcHeartbeat(
  ctx: RpcCtx,
  agentId: string,
  ownerId: string | null = null,
): Promise<DOResult<{ ok: true }> | DOError> {
  return ctx.withMember(agentId, ownerId, (resolved) => {
    const result = heartbeatFn(ctx.sql, resolved);
    if (!isDOError(result)) {
      const now = Date.now();
      const last = ctx.lastHeartbeatBroadcast.get(resolved) || 0;
      if (now - last >= HEARTBEAT_BROADCAST_DEBOUNCE_MS) {
        ctx.lastHeartbeatBroadcast.set(resolved, now);
        ctx.broadcastToWatchers(
          { type: 'heartbeat', agent_id: resolved, ts: now },
          { invalidateCache: false },
        );
      }
    }
    return result;
  });
}
