import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function getTeam(id = 'test-team') {
  return env.TEAM.get(env.TEAM.idFromName(id));
}

// --- Join: runtime metadata variants ---

describe('Join with runtime metadata variants', () => {
  const team = () => getTeam('join-runtime-variants');

  it('join with string tool name infers host_tool', async () => {
    const res = await team().join('cursor:jrv1', 'user-jrv1', 'alice', 'vscode');
    expect(res.ok).toBe(true);

    const ctx = await team().getContext('cursor:jrv1', 'user-jrv1');
    const me = ctx.members.find((m) => m.agent_id === 'cursor:jrv1');
    expect(me.host_tool).toBe('vscode');
  });

  it('join with null tool infers host_tool from agentId prefix', async () => {
    const res = await team().join('windsurf:jrv2', 'user-jrv2', 'bob', null);
    expect(res.ok).toBe(true);

    const ctx = await team().getContext('windsurf:jrv2', 'user-jrv2');
    const me = ctx.members.find((m) => m.agent_id === 'windsurf:jrv2');
    expect(me.host_tool).toBe('windsurf');
  });

  it('join with structured runtime preserves all metadata', async () => {
    const runtime = {
      hostTool: 'cursor',
      agentSurface: 'copilot',
      transport: 'mcp',
      tier: 'connected',
    };
    const res = await team().join('cursor:jrv3', 'user-jrv3', 'carol', runtime);
    expect(res.ok).toBe(true);

    const ctx = await team().getContext('cursor:jrv3', 'user-jrv3');
    const me = ctx.members.find((m) => m.agent_id === 'cursor:jrv3');
    expect(me.host_tool).toBe('cursor');
    expect(me.agent_surface).toBe('copilot');
    expect(me.transport).toBe('mcp');
  });

  it('re-join updates metadata without losing membership', async () => {
    // First join
    await team().join('cursor:jrv4', 'user-jrv4', 'dave', 'cursor');
    await team().updateActivity('cursor:jrv4', ['src/a.js'], 'Working', 'user-jrv4');

    // Re-join with updated metadata
    const res = await team().join('cursor:jrv4', 'user-jrv4', 'dave-updated', {
      hostTool: 'cursor',
      agentSurface: 'cline',
      transport: 'stdio',
    });
    expect(res.ok).toBe(true);

    // Metadata should be updated
    const ctx = await team().getContext('cursor:jrv4', 'user-jrv4');
    const me = ctx.members.find((m) => m.agent_id === 'cursor:jrv4');
    expect(me.handle).toBe('dave-updated');
    expect(me.agent_surface).toBe('cline');
    expect(me.transport).toBe('stdio');

    // Activity should be preserved (join doesn't clear activity)
    expect(me.activity.files).toContain('src/a.js');
  });

  it('join with invalid runtime values falls back to agentId inference', async () => {
    const runtime = {
      hostTool: '', // empty string should fall back
      agentSurface: null,
    };
    const res = await team().join('claude:jrv5', 'user-jrv5', 'eve', runtime);
    expect(res.ok).toBe(true);

    const ctx = await team().getContext('claude:jrv5', 'user-jrv5');
    const me = ctx.members.find((m) => m.agent_id === 'claude:jrv5');
    expect(me.host_tool).toBe('claude'); // inferred from agentId prefix
  });
});

// --- Leave: without ownerId (fallback behavior) ---

describe('Leave without ownerId', () => {
  const team = () => getTeam('leave-no-owner');

  it('leave without ownerId removes agent by agent_id', async () => {
    await team().join('cursor:lno1', 'user-lno1', 'alice', 'cursor');
    await team().join('claude:lno2', 'user-lno2', 'bob', 'claude');

    // Leave by agent_id only (no ownerId)
    const res = await team().leave('cursor:lno1');
    expect(res.ok).toBe(true);

    // Agent should be gone
    const hb = await team().heartbeat('cursor:lno1');
    expect(hb.error).toBeTruthy();

    // Other agent should still be there
    const hb2 = await team().heartbeat('claude:lno2');
    expect(hb2.ok).toBe(true);
  });

  it('leave without ownerId cleans up locks and activities', async () => {
    await team().join('cursor:lno3', 'user-lno3', 'carol', 'cursor');
    await team().join('claude:lno4', 'user-lno4', 'dave', 'claude');

    await team().claimFiles('cursor:lno3', ['src/leaving.js'], 'carol', 'cursor', 'user-lno3');
    await team().updateActivity('cursor:lno3', ['src/leaving.js'], 'Working', 'user-lno3');

    const leaveRes = await team().leave('cursor:lno3');
    expect(leaveRes.ok).toBe(true);

    // Other agent should be able to claim the now-released file
    const claim = await team().claimFiles(
      'claude:lno4',
      ['src/leaving.js'],
      'dave',
      'claude',
      'user-lno4',
    );
    expect(claim.claimed).toContain('src/leaving.js');
    expect(claim.blocked).toHaveLength(0);
  });
});

// --- Heartbeat: edge cases ---

describe('Heartbeat edge cases', () => {
  const team = () => getTeam('heartbeat-edge');

  it('heartbeat with ownerId verifies ownership', async () => {
    await team().join('cursor:hbe1', 'user-hbe1', 'alice', 'cursor');

    // Correct owner: should succeed
    const ok = await team().heartbeat('cursor:hbe1', 'user-hbe1');
    expect(ok.ok).toBe(true);

    // Wrong owner: should fail (identity resolution rejects)
    const fail = await team().heartbeat('cursor:hbe1', 'wrong-owner');
    expect(fail.error).toBeTruthy();
  });

  it('heartbeat returns error for agent that never joined', async () => {
    const res = await team().heartbeat('cursor:never-joined');
    expect(res.error).toContain('Not a member');
    expect(res.code).toBe('NOT_MEMBER');
  });

  it('heartbeat after leave returns error', async () => {
    await team().join('cursor:hbe2', 'user-hbe2', 'bob', 'cursor');
    await team().leave('cursor:hbe2', 'user-hbe2');

    const res = await team().heartbeat('cursor:hbe2');
    expect(res.error).toBeTruthy();
  });
});

// --- Identity resolution: prefix matching ---

describe('Identity resolution - prefix matching', () => {
  const team = () => getTeam('identity-prefix');

  it('resolves agentId by prefix when exact match fails', async () => {
    // Join with a full agent_id
    await team().join('cursor:abc123', 'user-pfx1', 'alice', 'cursor');

    // Access via just the prefix (no colon-suffix)
    // The identity module tries LIKE 'cursor:%' when exact match fails
    const ctx = await team().getContext('cursor', 'user-pfx1');
    expect(ctx.error).toBeUndefined();
    expect(ctx.members).toBeDefined();
    expect(ctx.members.length).toBeGreaterThanOrEqual(1);
  });

  it('prefix resolution respects ownership', async () => {
    // Accessing via prefix with wrong owner should fail
    const ctx = await team().getContext('cursor', 'wrong-owner-pfx');
    expect(ctx.error).toBeTruthy();
  });
});

// --- Leave: WebSocket subscription teardown ---
//
// The test pool cannot establish a real WebSocket handshake (workerd needs
// the full upgrade dance), so we cannot directly assert "the close frame was
// sent and the client received code 4001." We can, however, assert the
// surrounding invariants that prove the teardown ran:
//
//   1. After leave(), a fresh WS upgrade attempt for the same agent is
//      rejected with 403 (the member row is gone, so resolveOwnedAgentId
//      returns null).
//   2. leave() with no live sockets does not throw and returns ok:true,
//      so the teardown helper handles the empty-socket-set case cleanly.
//   3. team_owners persists when one of the user's agents leaves but other
//      agents remain (existing behavior, regression-guarded here).
//
// The deeper assertion (that the websocket frame and 4001 close fire) is
// covered by code review of revokeMemberSockets in membership-rpc.ts; the
// WS upgrade path is exercised in production. This gap is documented in
// the campaign report.

describe('Leave: WebSocket subscription teardown', () => {
  const team = () => getTeam('leave-ws-teardown');

  it('post-leave WS upgrade attempt is rejected with 403', async () => {
    await team().join('cursor:lwt1', 'user-lwt1', 'alice', 'cursor');

    // After leave, the member row is gone, so WS upgrade is denied at the
    // membership check. We exercise the path that would otherwise complete
    // a handshake: the workerd test pool can short-circuit at the membership
    // check, but a successful path tries to return a WebSocket and fails
    // because the test request lacks Upgrade: websocket. So we only assert
    // the post-leave 403, which is the security-relevant invariant.
    const leaveRes = await team().leave('cursor:lwt1', 'user-lwt1');
    expect(leaveRes.ok).toBe(true);

    const afterLeave = await team().fetch(
      new Request('http://localhost/ws?agentId=cursor:lwt1&ownerId=user-lwt1&role=agent', {
        headers: { 'X-Chinmeister-Verified': '1' },
      }),
    );
    expect(afterLeave.status).toBe(403);
    const text = await afterLeave.text();
    expect(text).toContain('Not a member');
  });

  it('leave() with no live sockets does not throw and succeeds', async () => {
    // Direct exercise of the teardown helper's empty-set path. There are no
    // live WebSockets in the test environment, so revokeMemberSockets must
    // be a no-op, and leave() must return ok:true.
    await team().join('cursor:lwt2', 'user-lwt2', 'bob', 'cursor');
    const res = await team().leave('cursor:lwt2', 'user-lwt2');
    expect(res.ok).toBe(true);
  });

  it('owner with multiple agents: leaving one preserves the other', async () => {
    // revokeMemberSockets queries `members` by owner_id and only tears down
    // sockets for the leaving agent. The user's other agents must remain
    // valid members. This guards against a regression where revocation
    // accidentally widens to "all agents owned by this user."
    await team().join('cursor:lwt3a', 'user-lwt3', 'carol', 'cursor');
    await team().join('claude:lwt3b', 'user-lwt3', 'carol', 'claude');

    const res = await team().leave('cursor:lwt3a', 'user-lwt3');
    expect(res.ok).toBe(true);

    // The second agent must still heartbeat successfully.
    const hb = await team().heartbeat('claude:lwt3b', 'user-lwt3');
    expect(hb.ok).toBe(true);

    // The first agent must be gone.
    const ws = await team().fetch(
      new Request('http://localhost/ws?agentId=cursor:lwt3a&ownerId=user-lwt3&role=agent', {
        headers: { 'X-Chinmeister-Verified': '1' },
      }),
    );
    expect(ws.status).toBe(403);
  });
});

// --- Multiple agents per owner ---

describe('Multiple agents per owner', () => {
  const team = () => getTeam('multi-agent-owner');
  const ownerId = 'user-multi1';

  it('same owner can join multiple agents', async () => {
    const j1 = await team().join('cursor:multi1', ownerId, 'alice', 'cursor');
    expect(j1.ok).toBe(true);

    const j2 = await team().join('claude:multi2', ownerId, 'alice', 'claude');
    expect(j2.ok).toBe(true);

    const ctx = await team().getContext('cursor:multi1', ownerId);
    expect(ctx.members.length).toBe(2);
    expect(ctx.members.some((m) => m.agent_id === 'cursor:multi1')).toBe(true);
    expect(ctx.members.some((m) => m.agent_id === 'claude:multi2')).toBe(true);
  });

  it('leaving one agent does not affect the other', async () => {
    await team().leave('cursor:multi1', ownerId);

    // Second agent should still be active
    const hb = await team().heartbeat('claude:multi2', ownerId);
    expect(hb.ok).toBe(true);

    // First agent should be gone
    const hbGone = await team().heartbeat('cursor:multi1');
    expect(hbGone.error).toBeTruthy();
  });
});
