// Pure helpers for reading team presence from Hibernation WebSocket tags.
//
// Each helper takes the DurableObjectState directly so it can be unit-tested
// without standing up a whole DO.

/** Agent IDs with an active `role:agent` WebSocket connection. */
export function getConnectedAgentIds(ctx: DurableObjectState): Set<string> {
  return new Set(
    ctx
      .getWebSockets('role:agent')
      .flatMap((ws) => ctx.getTags(ws))
      .filter((tag) => !tag.startsWith('role:') && !tag.startsWith('spawn:')),
  );
}

/**
 * All member IDs with any active WebSocket (agent, watcher, daemon).
 * Used by cleanup eviction protection - any connected socket keeps the
 * member row alive regardless of role.
 */
export function getAllConnectedMemberIds(ctx: DurableObjectState): Set<string> {
  return new Set(
    ctx
      .getWebSockets()
      .flatMap((ws) => ctx.getTags(ws))
      .filter((tag) => !tag.startsWith('role:') && !tag.startsWith('spawn:')),
  );
}

/**
 * Custom WebSocket close code used when a member's access has been revoked
 * (explicit leave or future kick). Range 4000-4999 is reserved for app-private
 * codes per RFC 6455, so the client can distinguish revocation from a 1006
 * abnormal close and stop reconnecting.
 */
export const MEMBERSHIP_REVOKED_CLOSE_CODE = 4001;

/**
 * Sockets tagged with the given agentId. Tags are written by `acceptWebSocket`
 * in handleFetch with `[resolvedAgentId, 'role:*', 'spawn:*']`, so a tag-filtered
 * `getWebSockets(agentId)` returns every live socket for that agent across all
 * roles (agent, daemon, watcher).
 */
export function getSocketsForAgent(ctx: DurableObjectState, agentId: string): WebSocket[] {
  return ctx.getWebSockets(agentId);
}

/** All connected sockets with spawn capability (identified by `spawn:*` tags). */
export function getExecutorSockets(ctx: DurableObjectState): WebSocket[] {
  const executors: WebSocket[] = [];
  for (const ws of ctx.getWebSockets()) {
    try {
      if (ctx.getTags(ws).some((t) => t.startsWith('spawn:'))) {
        executors.push(ws);
      }
    } catch {
      /* socket may be closing */
    }
  }
  return executors;
}

export function hasExecutorConnected(ctx: DurableObjectState): boolean {
  return getExecutorSockets(ctx).length > 0;
}

/** Collect available spawn tools from all connected daemon WebSocket tags. */
export function getAvailableSpawnTools(ctx: DurableObjectState): string[] {
  const tools = new Set<string>();
  for (const ws of getExecutorSockets(ctx)) {
    try {
      for (const tag of ctx.getTags(ws)) {
        if (tag.startsWith('spawn:')) tools.add(tag.slice(6));
      }
    } catch {
      /* socket may be closing */
    }
  }
  return [...tools];
}
