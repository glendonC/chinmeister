import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function getTeam(id = 'test-team') {
  return env.TEAM.get(env.TEAM.idFromName(id));
}

// --- Save and search memory ---

describe('Memory save and search', () => {
  const team = () => getTeam('memory-save-search');
  const agentId = 'cursor:mss1';
  const ownerId = 'user-mss1';

  it('setup: join', async () => {
    await team().join(agentId, ownerId, 'alice', 'cursor');
  });

  it('save a memory, search for it — found', async () => {
    const save = await team().saveMemory(
      agentId,
      'Always use connection pooling for database access',
      ['architecture', 'database'],
      'alice',
      ownerId,
    );
    expect(save.ok).toBe(true);
    expect(save.id).toBeDefined();

    const search = await team().searchMemories(agentId, 'connection pooling', null, 10, ownerId);
    expect(search.memories.length).toBeGreaterThan(0);
    expect(search.memories[0].text).toContain('connection pooling');
  });

  it('search by tags finds the memory', async () => {
    const search = await team().searchMemories(agentId, null, ['architecture'], 10, ownerId);
    expect(search.memories.length).toBeGreaterThan(0);
    expect(search.memories[0].tags).toContain('architecture');
  });
});

// --- Memory eviction beyond cap ---

describe('Memory eviction beyond MEMORY_MAX_COUNT', () => {
  const team = () => getTeam('memory-eviction');
  const agentId = 'cursor:me1';
  const ownerId = 'user-me1';

  it('setup: join', async () => {
    await team().join(agentId, ownerId, 'alice', 'cursor');
  });

  it('saving 501+ memories evicts oldest (check evicted count)', async () => {
    // Fill to the cap (500)
    for (let i = 0; i < 501; i++) {
      await team().saveMemory(agentId, `Memory entry number ${i}`, ['bulk'], 'alice', ownerId);
    }

    // The 502nd memory should trigger eviction of the oldest
    const result = await team().saveMemory(
      agentId,
      'Memory that triggers eviction',
      ['eviction-test'],
      'alice',
      ownerId,
    );
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
    // At this point we have 502 inserts but cap is 500, so at least 2 should be evicted
    expect(result.evicted).toBeGreaterThanOrEqual(1);

    // Verify the newest memory is searchable
    const search = await team().searchMemories(agentId, 'triggers eviction', null, 10, ownerId);
    expect(search.memories.length).toBeGreaterThan(0);
    expect(search.memories[0].text).toContain('triggers eviction');

    // Verify earliest memory was evicted
    const searchOldest = await team().searchMemories(
      agentId,
      'Memory entry number 0',
      null,
      10,
      ownerId,
    );
    expect(searchOldest.memories.length).toBe(0);
  });
}, 120_000);

// --- Memory update lifecycle ---

describe('Memory update lifecycle', () => {
  const team = () => getTeam('memory-update');
  const agentId = 'cursor:mu1';
  const ownerId = 'user-mu1';
  let memoryId;

  it('setup: join', async () => {
    await team().join(agentId, ownerId, 'alice', 'cursor');
  });

  it('save memory, update it, search — updated version found', async () => {
    // Save original
    const save = await team().saveMemory(
      agentId,
      'Original memory text about deployment',
      ['ops'],
      'alice',
      ownerId,
    );
    expect(save.ok).toBe(true);
    memoryId = save.id;

    // Update text
    const update = await team().updateMemory(
      agentId,
      memoryId,
      'Updated memory text about blue-green deployment',
      ['ops', 'deployment'],
      ownerId,
    );
    expect(update.ok).toBe(true);

    // Search for updated text
    const search = await team().searchMemories(agentId, 'blue-green deployment', null, 10, ownerId);
    expect(search.memories.length).toBeGreaterThan(0);
    expect(search.memories[0].text).toContain('blue-green deployment');
    expect(search.memories[0].id).toBe(memoryId);

    // Original text should not be found
    const searchOld = await team().searchMemories(
      agentId,
      'Original memory text about deployment',
      null,
      10,
      ownerId,
    );
    expect(searchOld.memories.length).toBe(0);
  });

  it('update tags only', async () => {
    const update = await team().updateMemory(
      agentId,
      memoryId,
      undefined,
      ['ops', 'deployment', 'strategy'],
      ownerId,
    );
    expect(update.ok).toBe(true);

    const search = await team().searchMemories(agentId, null, ['strategy'], 10, ownerId);
    expect(search.memories.length).toBeGreaterThan(0);
    expect(search.memories[0].tags).toContain('strategy');
  });

  it('update non-existent memory returns error', async () => {
    const update = await team().updateMemory(
      agentId,
      'nonexistent-id-12345',
      'Should fail',
      ['fail'],
      ownerId,
    );
    expect(update.error).toBe('Memory not found');
    expect(update.code).toBe('NOT_FOUND');
  });
});

// --- Memory delete lifecycle ---

describe('Memory delete lifecycle', () => {
  const team = () => getTeam('memory-delete');
  const agentId = 'cursor:md1';
  const ownerId = 'user-md1';

  it('setup: join', async () => {
    await team().join(agentId, ownerId, 'alice', 'cursor');
  });

  it('delete memory, search — not found', async () => {
    // Save
    const save = await team().saveMemory(
      agentId,
      'Temporary memory to be deleted',
      ['temp'],
      'alice',
      ownerId,
    );
    expect(save.ok).toBe(true);

    // Verify it exists
    const searchBefore = await team().searchMemories(
      agentId,
      'Temporary memory to be deleted',
      null,
      10,
      ownerId,
    );
    expect(searchBefore.memories.length).toBe(1);

    // Delete
    const del = await team().deleteMemory(agentId, save.id, ownerId);
    expect(del.ok).toBe(true);

    // Verify it's gone
    const searchAfter = await team().searchMemories(
      agentId,
      'Temporary memory to be deleted',
      null,
      10,
      ownerId,
    );
    expect(searchAfter.memories.length).toBe(0);
  });

  it('delete non-existent memory returns error', async () => {
    const del = await team().deleteMemory(agentId, 'nonexistent-memory-id', ownerId);
    expect(del.error).toBe('Memory not found');
    expect(del.code).toBe('NOT_FOUND');
  });
});

// --- Memory persists across context calls ---

describe('Memory persistence across context', () => {
  const team = () => getTeam('memory-persistence');
  const agentId = 'cursor:mp1';
  const ownerId = 'user-mp1';

  it('setup: join and save memories', async () => {
    await team().join(agentId, ownerId, 'alice', 'cursor');
    await team().saveMemory(agentId, 'Persistent memory one', ['persist'], 'alice', ownerId);
    await team().saveMemory(agentId, 'Persistent memory two', ['persist'], 'alice', ownerId);
  });

  it('memories visible in getContext', async () => {
    const ctx = await team().getContext(agentId, ownerId);
    expect(ctx.memories.length).toBeGreaterThanOrEqual(2);
    const texts = ctx.memories.map((m) => m.text);
    expect(texts).toContain('Persistent memory one');
    expect(texts).toContain('Persistent memory two');
  });

  it('memories survive multiple getContext cleanup cycles', async () => {
    for (let i = 0; i < 5; i++) {
      const ctx = await team().getContext(agentId, ownerId);
      expect(ctx.memories.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// --- Memory with runtime metadata ---

describe('Memory runtime metadata', () => {
  const team = () => getTeam('memory-runtime');
  const agentId = 'cursor:mr1';
  const ownerId = 'user-mr1';

  it('setup: join', async () => {
    await team().join(agentId, ownerId, 'alice', 'cursor');
  });

  it('memory preserves runtime metadata', async () => {
    const save = await team().saveMemory(
      agentId,
      'Runtime metadata memory',
      ['meta'],
      'alice',
      { hostTool: 'cursor', agentSurface: 'cline', transport: 'mcp', tier: 'connected' },
      ownerId,
    );
    expect(save.ok).toBe(true);

    const search = await team().searchMemories(
      agentId,
      'Runtime metadata memory',
      null,
      10,
      ownerId,
    );
    expect(search.memories.length).toBe(1);
    expect(search.memories[0].host_tool).toBe('cursor');
    expect(search.memories[0].agent_surface).toBe('cline');
  });
});
