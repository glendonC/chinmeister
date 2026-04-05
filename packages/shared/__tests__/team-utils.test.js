import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { isValidTeamId, TEAM_ID_PATTERN, findTeamFile } from '../team-utils.js';
import { existsSync, readFileSync } from 'node:fs';

describe('TEAM_ID_PATTERN', () => {
  it('matches valid team IDs (t_ + 16 hex chars)', () => {
    expect(TEAM_ID_PATTERN.test('t_abcdef0123456789')).toBe(true);
    expect(TEAM_ID_PATTERN.test('t_0000000000000000')).toBe(true);
    expect(TEAM_ID_PATTERN.test('t_ffffffffffffffff')).toBe(true);
  });

  it('rejects IDs without t_ prefix', () => {
    expect(TEAM_ID_PATTERN.test('abcdef0123456789')).toBe(false);
    expect(TEAM_ID_PATTERN.test('x_abcdef0123456789')).toBe(false);
  });

  it('rejects IDs with wrong hex length (too short)', () => {
    expect(TEAM_ID_PATTERN.test('t_abc123')).toBe(false);
    expect(TEAM_ID_PATTERN.test('t_abc')).toBe(false);
  });

  it('rejects IDs with wrong hex length (too long)', () => {
    expect(TEAM_ID_PATTERN.test('t_abcdef01234567890')).toBe(false);
  });

  it('rejects IDs with uppercase hex', () => {
    expect(TEAM_ID_PATTERN.test('t_ABCDEF0123456789')).toBe(false);
    expect(TEAM_ID_PATTERN.test('t_Abcdef0123456789')).toBe(false);
  });

  it('rejects strings with spaces', () => {
    expect(TEAM_ID_PATTERN.test('my team')).toBe(false);
  });

  it('rejects strings with special characters', () => {
    expect(TEAM_ID_PATTERN.test('team@foo')).toBe(false);
    expect(TEAM_ID_PATTERN.test('team.foo')).toBe(false);
    expect(TEAM_ID_PATTERN.test('team/foo')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(TEAM_ID_PATTERN.test('')).toBe(false);
  });
});

describe('isValidTeamId', () => {
  it('accepts valid team IDs', () => {
    expect(isValidTeamId('t_abcdef0123456789')).toBe(true);
    expect(isValidTeamId('t_0000000000000000')).toBe(true);
    expect(isValidTeamId('t_a7b3c9d2e1f04856')).toBe(true);
  });

  it('rejects freeform strings', () => {
    expect(isValidTeamId('myteam')).toBe(false);
    expect(isValidTeamId('team123')).toBe(false);
    expect(isValidTeamId('my-team')).toBe(false);
    expect(isValidTeamId('my_team')).toBe(false);
  });

  it('rejects too-short hex after prefix', () => {
    expect(isValidTeamId('t_abc')).toBe(false);
  });

  it('rejects too-long hex after prefix', () => {
    expect(isValidTeamId('t_abcdef01234567890')).toBe(false);
  });

  it('rejects wrong prefix', () => {
    expect(isValidTeamId('x_abcdef0123456789')).toBe(false);
    expect(isValidTeamId('T_abcdef0123456789')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidTeamId('')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidTeamId(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidTeamId(undefined)).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isValidTeamId(123)).toBe(false);
    expect(isValidTeamId({})).toBe(false);
    expect(isValidTeamId([])).toBe(false);
    expect(isValidTeamId(true)).toBe(false);
  });

  it('rejects IDs with special characters', () => {
    expect(isValidTeamId('team@name')).toBe(false);
    expect(isValidTeamId('team.name')).toBe(false);
    expect(isValidTeamId('team name')).toBe(false);
    expect(isValidTeamId('team/name')).toBe(false);
    expect(isValidTeamId('team!name')).toBe(false);
  });
});

describe('findTeamFile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('finds .chinwag in the current directory', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ team: 't_abcdef0123456789', name: 'My Project' }),
    );

    const result = findTeamFile('/home/user/project');
    expect(result).toEqual({
      filePath: '/home/user/project/.chinwag',
      root: '/home/user/project',
      teamId: 't_abcdef0123456789',
      teamName: 'My Project',
    });
  });

  it('walks up to parent directory to find .chinwag', () => {
    existsSync
      .mockReturnValueOnce(false) // /home/user/project/sub/.chinwag
      .mockReturnValueOnce(true); // /home/user/project/.chinwag
    readFileSync.mockReturnValue(JSON.stringify({ team: 't_0000000000000001' }));

    const result = findTeamFile('/home/user/project/sub');
    expect(result).toEqual({
      filePath: '/home/user/project/.chinwag',
      root: '/home/user/project',
      teamId: 't_0000000000000001',
      teamName: 'project',
    });
  });

  it('returns null when not found (reaches root)', () => {
    existsSync.mockReturnValue(false);

    const result = findTeamFile('/home/user/project');
    expect(result).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('not valid json {{{');

    const result = findTeamFile('/home/user/project');
    expect(result).toBeNull();
  });

  it('returns null on invalid team ID', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ team: 'invalid team!!' }));

    const result = findTeamFile('/home/user/project');
    expect(result).toBeNull();
  });

  it('returns null when team ID is missing from file', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ name: 'No Team' }));

    const result = findTeamFile('/home/user/project');
    expect(result).toBeNull();
  });

  it('returns null when team ID is freeform (not t_ prefixed)', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ team: 'my-team' }));

    const result = findTeamFile('/home/user/project');
    expect(result).toBeNull();
  });

  it('returns null when team is null in JSON', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ team: null }));

    const result = findTeamFile('/home/user/project');
    expect(result).toBeNull();
  });

  it('uses directory basename as default team name when name is missing', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ team: 't_abcdef0123456789' }));

    const result = findTeamFile('/home/user/my-project');
    expect(result.teamName).toBe('my-project');
  });

  it('uses directory basename as default team name when name is empty string', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ team: 't_abcdef0123456789', name: '' }));

    const result = findTeamFile('/home/user/cool-repo');
    expect(result.teamName).toBe('cool-repo');
  });

  it('walks multiple levels up to find .chinwag', () => {
    existsSync
      .mockReturnValueOnce(false) // /a/b/c/.chinwag
      .mockReturnValueOnce(false) // /a/b/.chinwag
      .mockReturnValueOnce(true); // /a/.chinwag
    readFileSync.mockReturnValue(JSON.stringify({ team: 't_1111111111111111', name: 'Root' }));

    const result = findTeamFile('/a/b/c');
    expect(result).toEqual({
      filePath: '/a/.chinwag',
      root: '/a',
      teamId: 't_1111111111111111',
      teamName: 'Root',
    });
  });
});
