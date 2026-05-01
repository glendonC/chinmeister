// E2E: an activity update from one agent shows up in the team context
// another agent reads. The WS broadcast handler reads the same SQL state
// that getContext returns, so a correct landing here means the WS pipeline
// has correct input even though we cannot complete a real upgrade in the
// in-process pool.
//
// The WS handshake itself is exercised by manual or staging tests; the
// in-process workerd pool's WebSocket support is limited (the Hibernation
// API expects a full upgrade dance that the test transport short-circuits).

import { env } from 'cloudflare:test';
import { describe, it, expect, afterAll } from 'vitest';

import { createUserAndTeam, joinAgent, cleanupTeam } from './fixtures/test-helpers.js';

interface TeamContextLike {
  members: Array<{
    agent_id: string;
    activity: { files: string[]; summary: string; updated_at: string } | null;
  }>;
}

describe('e2e: activity delta lands in DO state', () => {
  const cleanup: string[] = [];
  afterAll(async () => {
    for (const teamId of cleanup) await cleanupTeam(env, teamId);
  });

  it("agent2's getContext reflects agent1's recent activity update", async () => {
    const owner = await createUserAndTeam(env);
    cleanup.push(owner.teamId);

    const agent1 = {
      agentId: 'cursor:ads-1',
      handle: 'reporter',
      hostTool: 'cursor',
      userId: owner.userId,
    };
    const agent2 = {
      agentId: 'claude:ads-2',
      handle: 'observer',
      hostTool: 'claude',
      userId: owner.userId,
    };
    await joinAgent(env, owner.teamId, agent1);
    await joinAgent(env, owner.teamId, agent2);

    const team = env.TEAM.get(env.TEAM.idFromName(owner.teamId));
    const files = ['src/feature.ts', 'src/feature.test.ts'];
    const summary = 'wiring up the new feature flag';

    const before = Date.now();
    const update = await team.updateActivity(agent1.agentId, files, summary, agent1.userId);
    expect('error' in update).toBe(false);

    const ctx = (await team.getContext(agent2.agentId, agent2.userId)) as TeamContextLike;
    expect(ctx.members).toBeDefined();

    const reporter = ctx.members.find((m) => m.agent_id === agent1.agentId);
    expect(reporter).toBeDefined();
    if (!reporter) return;
    expect(reporter.activity).not.toBeNull();
    expect(reporter.activity?.summary).toBe(summary);
    expect(reporter.activity?.files).toEqual(expect.arrayContaining(files));

    const updatedAt = new Date(reporter.activity!.updated_at + 'Z').getTime();
    expect(Number.isFinite(updatedAt)).toBe(true);
    // Sanity: the timestamp is within a reasonable window of the call. SQLite
    // stores second precision, so allow a generous skew.
    expect(updatedAt).toBeGreaterThanOrEqual(before - 5_000);
    expect(updatedAt).toBeLessThanOrEqual(Date.now() + 5_000);
  });
});
