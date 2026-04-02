import { describe, it, expect } from 'vitest';
import { formatConflictsList, formatTeamContextDisplay } from '../utils/display.js';

// --- formatConflictsList ---

describe('formatConflictsList', () => {
  it('returns empty array when no conflicts or locks', () => {
    expect(formatConflictsList([], [])).toEqual([]);
  });

  it('returns empty array when both args are null', () => {
    expect(formatConflictsList(null, null)).toEqual([]);
  });

  it('returns empty array when both args are undefined', () => {
    expect(formatConflictsList(undefined, undefined)).toEqual([]);
  });

  it('formats a conflict with tool name', () => {
    const conflicts = [{
      owner_handle: 'alice',
      tool: 'cursor',
      files: ['src/api.js'],
      summary: 'Adding endpoints',
    }];
    const lines = formatConflictsList(conflicts, []);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/alice \(cursor\) is working on src\/api\.js/);
    expect(lines[0]).toMatch(/"Adding endpoints"/);
  });

  it('formats a conflict without tool (unknown)', () => {
    const conflicts = [{
      owner_handle: 'bob',
      tool: 'unknown',
      files: ['auth.js'],
      summary: 'Fixing login',
    }];
    const lines = formatConflictsList(conflicts, []);
    expect(lines[0]).toMatch(/bob is working on auth\.js/);
    expect(lines[0]).not.toMatch(/unknown/);
  });

  it('formats multiple files in a conflict', () => {
    const conflicts = [{
      owner_handle: 'alice',
      tool: 'cursor',
      files: ['auth.js', 'db.js', 'utils.js'],
      summary: 'Refactoring',
    }];
    const lines = formatConflictsList(conflicts, []);
    expect(lines[0]).toMatch(/auth\.js, db\.js, utils\.js/);
  });

  it('formats locked files', () => {
    const locks = [{
      file: 'db.js',
      held_by: 'bob',
      tool: 'aider',
    }];
    const lines = formatConflictsList([], locks);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/db\.js is locked by bob \(aider\)/);
  });

  it('formats locked files without tool', () => {
    const locks = [{
      file: 'db.js',
      held_by: 'bob',
      tool: 'unknown',
    }];
    const lines = formatConflictsList([], locks);
    expect(lines[0]).toMatch(/db\.js is locked by bob/);
    expect(lines[0]).not.toMatch(/unknown/);
  });

  it('combines conflicts and locks', () => {
    const conflicts = [{
      owner_handle: 'alice',
      tool: 'cursor',
      files: ['api.js'],
      summary: 'API work',
    }];
    const locks = [{
      file: 'db.js',
      held_by: 'bob',
      tool: 'aider',
    }];
    const lines = formatConflictsList(conflicts, locks);
    expect(lines.length).toBe(2);
    expect(lines[0]).toMatch(/alice/);
    expect(lines[1]).toMatch(/bob/);
  });

  it('handles multiple conflicts', () => {
    const conflicts = [
      { owner_handle: 'alice', tool: 'cursor', files: ['a.js'], summary: 'Task A' },
      { owner_handle: 'bob', tool: 'aider', files: ['b.js'], summary: 'Task B' },
    ];
    const lines = formatConflictsList(conflicts, []);
    expect(lines.length).toBe(2);
  });
});

// --- formatTeamContextDisplay ---

describe('formatTeamContextDisplay', () => {
  it('returns empty array when no members', () => {
    const lines = formatTeamContextDisplay({ members: [] });
    expect(lines).toEqual([]);
  });

  it('returns empty array when members is null', () => {
    const lines = formatTeamContextDisplay({ members: null });
    expect(lines).toEqual([]);
  });

  it('returns empty array when members is undefined', () => {
    const lines = formatTeamContextDisplay({});
    expect(lines).toEqual([]);
  });

  it('formats a member with activity', () => {
    const ctx = {
      members: [{
        handle: 'alice',
        status: 'active',
        tool: 'cursor',
        activity: {
          files: ['auth.js', 'db.js'],
          summary: 'Fixing login',
        },
      }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/alice \(active, cursor\): working on auth\.js, db\.js/);
    expect(lines[0]).toMatch(/"Fixing login"/);
  });

  it('shows idle for member without activity', () => {
    const ctx = {
      members: [{ handle: 'bob', status: 'active', tool: 'cursor' }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines[0]).toMatch(/bob \(active, cursor\): idle/);
  });

  it('omits tool info when tool is unknown', () => {
    const ctx = {
      members: [{ handle: 'bob', status: 'idle', tool: 'unknown' }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines[0]).toMatch(/bob \(idle\): idle/);
    expect(lines[0]).not.toMatch(/unknown/);
  });

  it('omits tool info when tool is missing', () => {
    const ctx = {
      members: [{ handle: 'bob', status: 'idle' }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines[0]).toMatch(/bob \(idle\): idle/);
  });

  it('formats activity with files but no summary', () => {
    const ctx = {
      members: [{
        handle: 'alice',
        status: 'active',
        tool: 'cursor',
        activity: { files: ['auth.js'] },
      }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines[0]).toMatch(/working on auth\.js/);
    expect(lines[0]).not.toMatch(/"/);
  });

  it('includes locked files section', () => {
    const ctx = {
      members: [{ handle: 'alice', status: 'active' }],
      locks: [{
        file_path: 'auth.js',
        owner_handle: 'alice',
        tool: 'cursor',
        minutes_held: 5.8,
      }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines.some(l => l.includes('Locked files:'))).toBe(true);
    expect(lines.some(l => l.includes('auth.js') && l.includes('alice (cursor)') && l.includes('6m'))).toBe(true);
  });

  it('rounds minutes_held to nearest integer', () => {
    const ctx = {
      members: [{ handle: 'alice', status: 'active' }],
      locks: [{ file_path: 'x.js', owner_handle: 'bob', tool: 'aider', minutes_held: 3.2 }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines.some(l => l.includes('3m'))).toBe(true);
  });

  it('includes memories section', () => {
    const ctx = {
      members: [{ handle: 'alice', status: 'active' }],
      memories: [{ text: 'Redis on port 6379', tags: ['config', 'redis'] }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines.some(l => l.includes('Project knowledge:'))).toBe(true);
    expect(lines.some(l => l.includes('Redis on port 6379 [config, redis]'))).toBe(true);
  });

  it('shows memories without tags', () => {
    const ctx = {
      members: [{ handle: 'alice', status: 'active' }],
      memories: [{ text: 'Important note' }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines.some(l => l.includes('Important note'))).toBe(true);
  });

  it('shows memories with empty tags array', () => {
    const ctx = {
      members: [{ handle: 'alice', status: 'active' }],
      memories: [{ text: 'No tags', tags: [] }],
    };
    const lines = formatTeamContextDisplay(ctx);
    const memLine = lines.find(l => l.includes('No tags'));
    expect(memLine).toBeDefined();
    expect(memLine).not.toMatch(/\[/);
  });

  it('does not show insights by default', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const ctx = {
      members: [{
        handle: 'alice',
        status: 'active',
        activity: { files: ['stuck.js'], updated_at: thirtyMinAgo },
        minutes_since_update: 30,
      }],
    };
    const lines = formatTeamContextDisplay(ctx);
    expect(lines.some(l => l.includes('Insights:'))).toBe(false);
  });

  it('shows insights when showInsights is true', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const ctx = {
      members: [{
        handle: 'alice',
        status: 'active',
        activity: { files: ['stuck.js'], updated_at: thirtyMinAgo },
        minutes_since_update: 30,
      }],
    };
    const lines = formatTeamContextDisplay(ctx, { showInsights: true });
    expect(lines.some(l => l.includes('Insights:'))).toBe(true);
    expect(lines.some(l => l.includes('alice has been on stuck.js'))).toBe(true);
    expect(lines.some(l => l.includes('may need help'))).toBe(true);
  });

  it('does not show insights for recently active agents', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const ctx = {
      members: [{
        handle: 'alice',
        status: 'active',
        activity: { files: ['active.js'], updated_at: fiveMinAgo },
        minutes_since_update: 5,
      }],
    };
    const lines = formatTeamContextDisplay(ctx, { showInsights: true });
    expect(lines.some(l => l.includes('Insights:'))).toBe(false);
  });

  it('falls back to Date.now() calculation when minutes_since_update is null', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const ctx = {
      members: [{
        handle: 'alice',
        status: 'active',
        activity: { files: ['old.js'], updated_at: thirtyMinAgo },
        // no minutes_since_update
      }],
    };
    const lines = formatTeamContextDisplay(ctx, { showInsights: true });
    expect(lines.some(l => l.includes('may need help'))).toBe(true);
  });

  it('uses "a file" as fallback when no files in activity', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const ctx = {
      members: [{
        handle: 'alice',
        status: 'active',
        activity: { files: [], updated_at: thirtyMinAgo },
        minutes_since_update: 30,
      }],
    };
    const lines = formatTeamContextDisplay(ctx, { showInsights: true });
    expect(lines.some(l => l.includes('a file'))).toBe(true);
  });

  it('skips insights for members without updated_at', () => {
    const ctx = {
      members: [{
        handle: 'alice',
        status: 'active',
        activity: { files: ['x.js'] },
        // no updated_at
      }],
    };
    const lines = formatTeamContextDisplay(ctx, { showInsights: true });
    expect(lines.some(l => l.includes('Insights:'))).toBe(false);
  });

  it('includes multiple members, locks, and memories', () => {
    const ctx = {
      members: [
        { handle: 'alice', status: 'active', tool: 'cursor', activity: { files: ['auth.js'] } },
        { handle: 'bob', status: 'idle', tool: 'aider' },
      ],
      locks: [
        { file_path: 'db.js', owner_handle: 'alice', tool: 'cursor', minutes_held: 10 },
      ],
      memories: [
        { text: 'Use Redis', tags: ['infra'] },
        { text: 'Port 6379', tags: ['config'] },
      ],
    };
    const lines = formatTeamContextDisplay(ctx);
    // Two members
    expect(lines.filter(l => l.includes('alice') || l.includes('bob')).length).toBeGreaterThanOrEqual(2);
    // One lock
    expect(lines.some(l => l.includes('Locked files:'))).toBe(true);
    // Two memories
    expect(lines.filter(l => l.includes('Use Redis') || l.includes('Port 6379')).length).toBe(2);
  });
});
