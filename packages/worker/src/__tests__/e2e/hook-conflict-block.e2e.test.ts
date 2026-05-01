// E2E: two agents in the same team, one claims a file, the other is blocked.
// Exercises TeamDO.claimFiles directly (the path the Claude Code hook hits
// once the route handler has resolved auth and the team binding).

import { env } from 'cloudflare:test';
import { describe, it, expect, afterAll } from 'vitest';

import { createUserAndTeam, joinAgent, cleanupTeam } from './fixtures/test-helpers.js';

describe('e2e: hook conflict block', () => {
  const cleanup: string[] = [];
  afterAll(async () => {
    for (const teamId of cleanup) await cleanupTeam(env, teamId);
  });

  it('second agent claiming a held file is blocked with holder details', async () => {
    const owner = await createUserAndTeam(env);
    cleanup.push(owner.teamId);

    const agent1 = {
      agentId: 'cursor:hcb-1',
      handle: 'agent-one',
      hostTool: 'cursor',
      userId: owner.userId,
    };
    const agent2 = {
      agentId: 'claude:hcb-2',
      handle: 'agent-two',
      hostTool: 'claude',
      userId: owner.userId,
    };
    await joinAgent(env, owner.teamId, agent1);
    await joinAgent(env, owner.teamId, agent2);

    const team = env.TEAM.get(env.TEAM.idFromName(owner.teamId));
    const filePath = 'src/data.ts';

    const firstClaim = await team.claimFiles(
      agent1.agentId,
      [filePath],
      agent1.handle,
      agent1.hostTool,
      agent1.userId,
    );
    expect('error' in firstClaim).toBe(false);
    if ('error' in firstClaim) return;
    expect(firstClaim.claimed).toEqual([filePath]);
    expect(firstClaim.blocked).toHaveLength(0);

    const secondClaim = await team.claimFiles(
      agent2.agentId,
      [filePath],
      agent2.handle,
      agent2.hostTool,
      agent2.userId,
    );
    expect('error' in secondClaim).toBe(false);
    if ('error' in secondClaim) return;

    expect(secondClaim.claimed).toHaveLength(0);
    expect(secondClaim.blocked).toHaveLength(1);

    const block = secondClaim.blocked[0]!;
    expect(block.file).toBe(filePath);
    expect(block.held_by).toBe(agent1.handle);
    expect(block.host_tool).toBe(agent1.hostTool);
    expect(block.tool).toBe(agent1.hostTool);
    expect(block.claimed_at).toBeDefined();
  });
});
