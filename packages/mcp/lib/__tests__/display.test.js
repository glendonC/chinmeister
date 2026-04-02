import { describe, it, expect } from 'vitest';
import {
  formatLockDuration,
  formatMemberLine,
  formatLockLine,
  formatMemoryLine,
  formatConflictsList,
  formatTeamContextDisplay,
} from '../utils/display.js';

describe('display utilities', () => {
  describe('formatLockDuration', () => {
    it('rounds minutes to nearest integer', () => {
      expect(formatLockDuration(5.7)).toBe('6m');
      expect(formatLockDuration(5.2)).toBe('5m');
      expect(formatLockDuration(0.4)).toBe('0m');
    });

    it('handles exact integers', () => {
      expect(formatLockDuration(10)).toBe('10m');
      expect(formatLockDuration(0)).toBe('0m');
    });

    it('handles large values', () => {
      expect(formatLockDuration(120)).toBe('120m');
    });
  });

  describe('formatMemberLine', () => {
    it('formats active member with tool and activity', () => {
      const line = formatMemberLine({
        handle: 'alice',
        status: 'active',
        tool: 'cursor',
        activity: { files: ['auth.js', 'db.js'], summary: 'Fixing login' },
      });
      expect(line).toBe('  alice (active, cursor): working on auth.js, db.js \u2014 "Fixing login"');
    });

    it('formats idle member without activity', () => {
      const line = formatMemberLine({
        handle: 'bob',
        status: 'active',
        tool: 'unknown',
      });
      expect(line).toBe('  bob (active): idle');
    });

    it('omits tool when tool is "unknown"', () => {
      const line = formatMemberLine({
        handle: 'carol',
        status: 'idle',
        tool: 'unknown',
      });
      expect(line).not.toMatch(/unknown/);
    });

    it('formats activity without summary', () => {
      const line = formatMemberLine({
        handle: 'dave',
        status: 'active',
        tool: 'aider',
        activity: { files: ['test.js'] },
      });
      expect(line).toBe('  dave (active, aider): working on test.js');
    });
  });

  describe('formatLockLine', () => {
    it('formats a lock with tool', () => {
      const line = formatLockLine({
        file_path: 'auth.js',
        owner_handle: 'alice',
        tool: 'cursor',
        minutes_held: 5.8,
      });
      expect(line).toBe('  auth.js \u2014 alice (cursor) (6m)');
    });

    it('omits tool when tool is "unknown"', () => {
      const line = formatLockLine({
        file_path: 'db.js',
        owner_handle: 'bob',
        tool: 'unknown',
        minutes_held: 3,
      });
      expect(line).toBe('  db.js \u2014 bob (3m)');
      expect(line).not.toMatch(/unknown/);
    });
  });

  describe('formatMemoryLine', () => {
    it('formats memory with tags', () => {
      const line = formatMemoryLine({ text: 'Use Redis for cache', tags: ['config', 'infra'] });
      expect(line).toBe('  Use Redis for cache [config, infra]');
    });

    it('formats memory without tags', () => {
      const line = formatMemoryLine({ text: 'Important fact' });
      expect(line).toBe('  Important fact');
    });

    it('formats memory with empty tags array', () => {
      const line = formatMemoryLine({ text: 'Note', tags: [] });
      expect(line).toBe('  Note');
    });
  });

  describe('formatConflictsList', () => {
    it('returns empty array when no conflicts or locks', () => {
      expect(formatConflictsList([], [])).toEqual([]);
    });

    it('formats conflicts with tool info', () => {
      const lines = formatConflictsList(
        [{ owner_handle: 'alice', tool: 'cursor', files: ['auth.js'], summary: 'Fixing login' }],
        [],
      );
      expect(lines.length).toBe(1);
      expect(lines[0]).toMatch(/alice \(cursor\) is working on auth\.js/);
    });

    it('formats locked files', () => {
      const lines = formatConflictsList(
        [],
        [{ file: 'db.js', held_by: 'bob', tool: 'aider' }],
      );
      expect(lines.length).toBe(1);
      expect(lines[0]).toMatch(/db\.js is locked by bob \(aider\)/);
    });
  });

  describe('formatTeamContextDisplay', () => {
    it('returns empty array when no members', () => {
      expect(formatTeamContextDisplay({ members: [] })).toEqual([]);
    });

    it('uses formatMemberLine for consistent output', () => {
      const lines = formatTeamContextDisplay({
        members: [{ handle: 'alice', status: 'active', tool: 'cursor', activity: { files: ['a.js'] } }],
      });
      expect(lines[0]).toBe('  alice (active, cursor): working on a.js');
    });

    it('uses formatLockLine for consistent lock output', () => {
      const lines = formatTeamContextDisplay({
        members: [{ handle: 'alice', status: 'active', tool: 'cursor' }],
        locks: [{ file_path: 'auth.js', owner_handle: 'alice', tool: 'cursor', minutes_held: 5 }],
      });
      const lockLine = lines.find(l => l.includes('auth.js'));
      expect(lockLine).toBe('  auth.js \u2014 alice (cursor) (5m)');
    });

    it('uses formatMemoryLine for consistent memory output', () => {
      const lines = formatTeamContextDisplay({
        members: [{ handle: 'alice', status: 'active', tool: 'cursor' }],
        memories: [{ text: 'Use Redis', tags: ['config'] }],
      });
      const memLine = lines.find(l => l.includes('Use Redis'));
      expect(memLine).toBe('  Use Redis [config]');
    });

    it('shows stuckness insights when enabled and threshold exceeded', () => {
      const lines = formatTeamContextDisplay({
        members: [{
          handle: 'alice',
          status: 'active',
          tool: 'cursor',
          activity: { files: ['stuck.js'], updated_at: '2026-01-01T00:00:00Z' },
          minutes_since_update: 20,
        }],
      }, { showInsights: true });
      const insight = lines.find(l => l.includes('may need help'));
      expect(insight).toMatch(/alice has been on stuck\.js for 20m/);
    });
  });
});
