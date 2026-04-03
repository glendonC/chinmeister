import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function getDB() {
  return env.DATABASE.get(env.DATABASE.idFromName('main'));
}

// --- createUser ---

describe('createUser', () => {
  it('returns ok with id, handle, color, and token', async () => {
    const result = await getDB().createUser();
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.handle).toBeDefined();
    expect(result.color).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('returns a valid UUID for id', async () => {
    const result = await getDB().createUser();
    // UUID v4 format
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns a valid UUID for token', async () => {
    const result = await getDB().createUser();
    expect(result.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns a color from the allowed palette', async () => {
    const COLORS = [
      'red',
      'cyan',
      'yellow',
      'green',
      'magenta',
      'blue',
      'orange',
      'lime',
      'pink',
      'sky',
      'lavender',
      'white',
    ];
    const result = await getDB().createUser();
    expect(COLORS).toContain(result.color);
  });

  it('generates unique ids across multiple calls', async () => {
    const result1 = await getDB().createUser();
    const result2 = await getDB().createUser();
    expect(result1.id).not.toBe(result2.id);
    expect(result1.token).not.toBe(result2.token);
    // Handles could collide in theory, but extremely unlikely
  });

  it('generates a handle that looks like adjective+noun', async () => {
    const result = await getDB().createUser();
    // Handle should be lowercase alphanumeric (and possibly with trailing digits for collision)
    expect(result.handle).toMatch(/^[a-z]+[a-z0-9]*$/);
    expect(result.handle.length).toBeGreaterThanOrEqual(4);
  });
});

// --- getUser ---

describe('getUser', () => {
  it('returns the user by id', async () => {
    const created = await getDB().createUser();
    const result = await getDB().getUser(created.id);
    expect(result.ok).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(created.id);
    expect(result.user.handle).toBe(created.handle);
    expect(result.user.color).toBe(created.color);
  });

  it('returns error for nonexistent id', async () => {
    const result = await getDB().getUser('nonexistent-uuid-value');
    expect(result.error).toBeDefined();
    expect(result.ok).toBeUndefined();
  });

  it('does not expose the token field', async () => {
    const created = await getDB().createUser();
    const result = await getDB().getUser(created.id);
    expect(result.user.token).toBeUndefined();
  });

  it('includes created_at and last_active timestamps', async () => {
    const created = await getDB().createUser();
    const result = await getDB().getUser(created.id);
    expect(result.user.created_at).toBeDefined();
    expect(result.user.last_active).toBeDefined();
  });
});

// --- getUserByHandle ---

describe('getUserByHandle', () => {
  it('returns the user by handle', async () => {
    const created = await getDB().createUser();
    const result = await getDB().getUserByHandle(created.handle);
    expect(result.ok).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(created.id);
    expect(result.user.handle).toBe(created.handle);
  });

  it('returns error for nonexistent handle', async () => {
    const result = await getDB().getUserByHandle('nonexistenthandle999');
    expect(result.error).toBeDefined();
    expect(result.ok).toBeUndefined();
  });
});

// --- updateHandle ---

describe('updateHandle', () => {
  it('updates handle successfully', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateHandle(created.id, 'newname123');
    expect(result.ok).toBe(true);
    expect(result.handle).toBe('newname123');

    // Verify via getUser
    const fetched = await getDB().getUser(created.id);
    expect(fetched.user.handle).toBe('newname123');
  });

  it('rejects handle shorter than 3 characters', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateHandle(created.id, 'ab');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('3-20 characters');
  });

  it('rejects handle longer than 20 characters', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateHandle(created.id, 'a'.repeat(21));
    expect(result.error).toBeDefined();
    expect(result.error).toContain('3-20 characters');
  });

  it('rejects handle with special characters', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateHandle(created.id, 'user@name');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('alphanumeric');
  });

  it('rejects handle with spaces', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateHandle(created.id, 'user name');
    expect(result.error).toBeDefined();
  });

  it('rejects duplicate handle', async () => {
    const user1 = await getDB().createUser();
    const user2 = await getDB().createUser();
    await getDB().updateHandle(user1.id, 'taken_handle');
    const result = await getDB().updateHandle(user2.id, 'taken_handle');
    expect(result.error).toBe('Handle already taken');
  });

  it('allows underscores in handle', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateHandle(created.id, 'my_handle_1');
    expect(result.ok).toBe(true);
    expect(result.handle).toBe('my_handle_1');
  });

  it('accepts handle at exactly 3 characters', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateHandle(created.id, 'abc');
    expect(result.ok).toBe(true);
  });

  it('accepts handle at exactly 20 characters', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateHandle(created.id, 'a'.repeat(20));
    expect(result.ok).toBe(true);
  });
});

// --- updateColor ---

describe('updateColor', () => {
  it('updates color successfully', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateColor(created.id, 'cyan');
    expect(result.ok).toBe(true);
    expect(result.color).toBe('cyan');

    const fetched = await getDB().getUser(created.id);
    expect(fetched.user.color).toBe('cyan');
  });

  it('rejects invalid color', async () => {
    const created = await getDB().createUser();
    const result = await getDB().updateColor(created.id, 'rainbow');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Color must be one of');
  });

  it('accepts all valid colors', async () => {
    const COLORS = [
      'red',
      'cyan',
      'yellow',
      'green',
      'magenta',
      'blue',
      'orange',
      'lime',
      'pink',
      'sky',
      'lavender',
      'white',
    ];
    for (const color of COLORS) {
      const created = await getDB().createUser();
      const result = await getDB().updateColor(created.id, color);
      expect(result.ok).toBe(true);
      expect(result.color).toBe(color);
    }
  });
});

// --- setStatus ---

describe('setStatus', () => {
  it('sets and retrieves status', async () => {
    const created = await getDB().createUser();
    await getDB().setStatus(created.id, 'Working on refactor');
    const fetched = await getDB().getUser(created.id);
    expect(fetched.user.status).toBe('Working on refactor');
  });

  it('clears status when set to null', async () => {
    const created = await getDB().createUser();
    await getDB().setStatus(created.id, 'Busy');
    await getDB().setStatus(created.id, null);
    const fetched = await getDB().getUser(created.id);
    expect(fetched.user.status).toBeNull();
  });
});

// --- Rate limiting (DB-level) ---

describe('checkRateLimit / consumeRateLimit', () => {
  it('allows when count is below limit', async () => {
    const key = `test-rl-${Date.now()}-${Math.random()}`;
    const result = await getDB().checkRateLimit(key, 5);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('tracks count after consumeRateLimit', async () => {
    const key = `test-rl-consume-${Date.now()}-${Math.random()}`;
    await getDB().consumeRateLimit(key);
    await getDB().consumeRateLimit(key);
    const result = await getDB().checkRateLimit(key, 5);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(2);
  });

  it('returns not allowed when limit is reached', async () => {
    const key = `test-rl-full-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      await getDB().consumeRateLimit(key);
    }
    const result = await getDB().checkRateLimit(key, 3);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(3);
  });

  it('tracks different keys independently', async () => {
    const keyA = `test-rl-a-${Date.now()}-${Math.random()}`;
    const keyB = `test-rl-b-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      await getDB().consumeRateLimit(keyA);
    }
    const resultA = await getDB().checkRateLimit(keyA, 3);
    const resultB = await getDB().checkRateLimit(keyB, 3);
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
    expect(resultB.count).toBe(0);
  });

  it('uses default limit of 3 when not specified', async () => {
    const key = `test-rl-default-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      await getDB().consumeRateLimit(key);
    }
    const result = await getDB().checkRateLimit(key);
    expect(result.allowed).toBe(false);
  });
});

// --- User teams ---

describe('addUserTeam / getUserTeams / removeUserTeam', () => {
  it('adds and retrieves a team', async () => {
    const user = await getDB().createUser();
    const result = await getDB().addUserTeam(user.id, 't_0000000000000001', 'My Project');
    expect(result.ok).toBe(true);

    const teamsResult = await getDB().getUserTeams(user.id);
    expect(teamsResult.ok).toBe(true);
    expect(teamsResult.teams.length).toBe(1);
    expect(teamsResult.teams[0].team_id).toBe('t_0000000000000001');
    expect(teamsResult.teams[0].team_name).toBe('My Project');
  });

  it('adds multiple teams', async () => {
    const user = await getDB().createUser();
    await getDB().addUserTeam(user.id, 't_aaaa000000000001', 'Project A');
    await getDB().addUserTeam(user.id, 't_aaaa000000000002', 'Project B');
    const teamsResult = await getDB().getUserTeams(user.id);
    expect(teamsResult.teams.length).toBe(2);
  });

  it('removes a team', async () => {
    const user = await getDB().createUser();
    await getDB().addUserTeam(user.id, 't_bbbb000000000001', 'To Remove');
    const result = await getDB().removeUserTeam(user.id, 't_bbbb000000000001');
    expect(result.ok).toBe(true);

    const teamsResult = await getDB().getUserTeams(user.id);
    const found = teamsResult.teams.find((t) => t.team_id === 't_bbbb000000000001');
    expect(found).toBeUndefined();
  });

  it('upserts team name on conflict', async () => {
    const user = await getDB().createUser();
    await getDB().addUserTeam(user.id, 't_cccc000000000001', 'Old Name');
    await getDB().addUserTeam(user.id, 't_cccc000000000001', 'New Name');
    const teamsResult = await getDB().getUserTeams(user.id);
    const team = teamsResult.teams.find((t) => t.team_id === 't_cccc000000000001');
    expect(team.team_name).toBe('New Name');
  });

  it('does not overwrite team_name with null', async () => {
    const user = await getDB().createUser();
    await getDB().addUserTeam(user.id, 't_dddd000000000001', 'Has Name');
    await getDB().addUserTeam(user.id, 't_dddd000000000001', null);
    const teamsResult = await getDB().getUserTeams(user.id);
    const team = teamsResult.teams.find((t) => t.team_id === 't_dddd000000000001');
    expect(team.team_name).toBe('Has Name');
  });

  it('returns empty teams array for user with no teams', async () => {
    const user = await getDB().createUser();
    const teamsResult = await getDB().getUserTeams(user.id);
    expect(teamsResult.ok).toBe(true);
    expect(teamsResult.teams).toEqual([]);
  });

  it('limits to 50 teams', async () => {
    const user = await getDB().createUser();
    for (let i = 0; i < 55; i++) {
      const teamId = `t_${String(i).padStart(16, '0')}`;
      await getDB().addUserTeam(user.id, teamId, `Team ${i}`);
    }
    const teamsResult = await getDB().getUserTeams(user.id);
    expect(teamsResult.teams.length).toBe(50);
  });
});

// --- getStats ---

describe('getStats', () => {
  it('returns ok with totalUsers count', async () => {
    const stats = await getDB().getStats();
    expect(stats.ok).toBe(true);
    expect(stats.totalUsers).toBeDefined();
    expect(typeof stats.totalUsers).toBe('number');
  });
});

// --- updateAgentProfile ---

describe('updateAgentProfile', () => {
  it('creates a profile for an existing user', async () => {
    const user = await getDB().createUser();
    const result = await getDB().updateAgentProfile(user.id, {
      framework: 'cursor',
      languages: ['javascript', 'python'],
      frameworks: ['react'],
      tools: ['eslint'],
      platforms: ['mac'],
    });
    expect(result.ok).toBe(true);
  });

  it('returns error for nonexistent user', async () => {
    const result = await getDB().updateAgentProfile('nonexistent-uuid', {
      framework: 'cursor',
    });
    expect(result.error).toBe('User not found');
  });

  it('upserts on second call', async () => {
    const user = await getDB().createUser();
    await getDB().updateAgentProfile(user.id, { framework: 'cursor' });
    const result = await getDB().updateAgentProfile(user.id, { framework: 'aider' });
    expect(result.ok).toBe(true);
  });
});
