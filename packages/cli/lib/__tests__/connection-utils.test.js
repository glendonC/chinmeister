import { describe, it, expect } from 'vitest';
import { contextFingerprint, getPollInterval } from '../dashboard/connection.js';

describe('contextFingerprint', () => {
  it('returns empty string for null context', () => {
    expect(contextFingerprint(null)).toBe('');
  });

  it('returns consistent fingerprint for empty context', () => {
    expect(contextFingerprint({})).toBe(';0;0;0');
  });

  it('includes member agent_id and status', () => {
    const ctx = {
      members: [{ agent_id: 'agent1', status: 'active' }],
    };
    const fp = contextFingerprint(ctx);
    expect(fp).toContain('agent1:active');
  });

  it('includes member activity summary and file count', () => {
    const ctx = {
      members: [
        {
          agent_id: 'a1',
          status: 'active',
          activity: { summary: 'working on tests', files: ['a.ts', 'b.ts'] },
        },
      ],
    };
    const fp = contextFingerprint(ctx);
    expect(fp).toContain('a1:active:working on tests:2');
  });

  it('handles members without activity', () => {
    const ctx = {
      members: [{ agent_id: 'a1', status: 'idle' }],
    };
    const fp = contextFingerprint(ctx);
    expect(fp).toContain('a1:idle::0');
  });

  it('separates multiple members with pipe', () => {
    const ctx = {
      members: [
        { agent_id: 'a1', status: 'active' },
        { agent_id: 'a2', status: 'idle' },
      ],
    };
    const fp = contextFingerprint(ctx);
    expect(fp).toContain('|');
    expect(fp).toContain('a1:active');
    expect(fp).toContain('a2:idle');
  });

  it('includes counts for memories, messages, and locks', () => {
    const ctx = {
      members: [],
      memories: [1, 2, 3],
      messages: [1],
      locks: [1, 2],
    };
    expect(contextFingerprint(ctx)).toBe(';3;1;2');
  });

  it('produces different fingerprints for different states', () => {
    const ctx1 = { members: [{ agent_id: 'a1', status: 'active' }] };
    const ctx2 = { members: [{ agent_id: 'a1', status: 'idle' }] };
    expect(contextFingerprint(ctx1)).not.toBe(contextFingerprint(ctx2));
  });

  it('produces same fingerprint for identical states', () => {
    const ctx = {
      members: [{ agent_id: 'a1', status: 'active' }],
      memories: [1],
      messages: [],
      locks: [],
    };
    expect(contextFingerprint(ctx)).toBe(contextFingerprint(ctx));
  });
});

describe('getPollInterval', () => {
  it('returns fast interval with no failures and no idle', () => {
    const interval = getPollInterval(0, 0);
    expect(interval).toBeGreaterThan(0);
    expect(interval).toBeLessThan(10_000);
  });

  it('returns progressively slower intervals as failures increase', () => {
    const i0 = getPollInterval(0, 0);
    const i3 = getPollInterval(3, 0);
    const i5 = getPollInterval(5, 0);
    expect(i3).toBeGreaterThan(i0);
    expect(i5).toBeGreaterThan(i3);
  });

  it('returns progressively slower intervals as idle polls increase', () => {
    const i0 = getPollInterval(0, 0);
    const i10 = getPollInterval(0, 10);
    const i30 = getPollInterval(0, 30);
    const i100 = getPollInterval(0, 100);
    expect(i10).toBeGreaterThanOrEqual(i0);
    expect(i30).toBeGreaterThanOrEqual(i10);
    expect(i100).toBeGreaterThanOrEqual(i30);
  });

  it('caps backoff at a maximum value', () => {
    const i20 = getPollInterval(20, 0);
    const i50 = getPollInterval(50, 0);
    // Both should be at the cap
    expect(i20).toBe(i50);
  });

  it('failure backoff takes precedence over idle backoff', () => {
    // With 3+ failures, failure-based interval is used regardless of idle
    const failureInterval = getPollInterval(5, 0);
    const bothInterval = getPollInterval(5, 100);
    expect(failureInterval).toBe(bothInterval);
  });
});
