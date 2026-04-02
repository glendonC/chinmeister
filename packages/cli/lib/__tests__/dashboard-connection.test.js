import { describe, it, expect } from 'vitest';
import { classifyError, contextFingerprint, computePollInterval } from '../dashboard/connection.jsx';

describe('classifyError', () => {
  it('returns fatal offline state for 401', () => {
    const result = classifyError({ status: 401, message: '' });
    expect(result.state).toBe('offline');
    expect(result.fatal).toBe(true);
    expect(result.detail).toMatch(/session expired/i);
  });

  it('returns offline state for 403', () => {
    const result = classifyError({ status: 403, message: '' });
    expect(result.state).toBe('offline');
    expect(result.detail).toMatch(/access denied/i);
  });

  it('returns offline state for 404', () => {
    const result = classifyError({ status: 404, message: '' });
    expect(result.state).toBe('offline');
    expect(result.detail).toMatch(/team not found/i);
  });

  it('returns reconnecting state for 429 (rate limited)', () => {
    const result = classifyError({ status: 429, message: '' });
    expect(result.state).toBe('reconnecting');
    expect(result.detail).toMatch(/rate limited/i);
  });

  it('returns reconnecting state for 5xx errors', () => {
    expect(classifyError({ status: 500, message: '' }).state).toBe('reconnecting');
    expect(classifyError({ status: 502, message: '' }).state).toBe('reconnecting');
    expect(classifyError({ status: 503, message: '' }).state).toBe('reconnecting');
  });

  it('returns reconnecting state for timeout (408)', () => {
    const result = classifyError({ status: 408, message: '' });
    expect(result.state).toBe('reconnecting');
    expect(result.detail).toMatch(/timed out/i);
  });

  it('returns reconnecting state for timeout message', () => {
    const result = classifyError({ message: 'Request timed out after 30s' });
    expect(result.state).toBe('reconnecting');
    expect(result.detail).toMatch(/timed out/i);
  });

  it('returns offline for network-level errors', () => {
    const codes = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'];
    for (const code of codes) {
      const result = classifyError({ message: `fetch failed: ${code}` });
      expect(result.state).toBe('offline');
      expect(result.detail).toMatch(/cannot reach server/i);
    }
  });

  it('returns reconnecting with message for unknown errors', () => {
    const result = classifyError({ message: 'Something weird happened' });
    expect(result.state).toBe('reconnecting');
    expect(result.detail).toBe('Something weird happened');
  });

  it('returns generic fallback for empty error', () => {
    const result = classifyError({ message: '' });
    expect(result.state).toBe('reconnecting');
    expect(result.detail).toMatch(/connection issue/i);
  });
});

describe('contextFingerprint', () => {
  it('returns empty string for null/undefined context', () => {
    expect(contextFingerprint(null)).toBe('');
    expect(contextFingerprint(undefined)).toBe('');
  });

  it('returns consistent fingerprint for same context', () => {
    const ctx = {
      members: [
        { agent_id: 'a1', status: 'active', activity: { summary: 'Working', files: ['x.js'] } },
      ],
      memories: [{ id: 1 }],
      messages: [{ id: 1 }, { id: 2 }],
      locks: [],
    };
    const fp1 = contextFingerprint(ctx);
    const fp2 = contextFingerprint(ctx);
    expect(fp1).toBe(fp2);
    expect(fp1).toContain('a1:active:Working:1');
    expect(fp1).toContain(';1;');  // 1 memory
    expect(fp1).toContain(';2;');  // 2 messages
    expect(fp1.endsWith(';0')).toBe(true);   // 0 locks
  });

  it('returns different fingerprints when members change', () => {
    const base = {
      members: [{ agent_id: 'a1', status: 'active', activity: { summary: 'Working', files: [] } }],
      memories: [],
      messages: [],
      locks: [],
    };
    const changed = {
      ...base,
      members: [{ agent_id: 'a1', status: 'idle', activity: { summary: 'Working', files: [] } }],
    };
    expect(contextFingerprint(base)).not.toBe(contextFingerprint(changed));
  });

  it('returns different fingerprints when memory count changes', () => {
    const base = { members: [], memories: [], messages: [], locks: [] };
    const withMemory = { ...base, memories: [{ id: 1 }] };
    expect(contextFingerprint(base)).not.toBe(contextFingerprint(withMemory));
  });

  it('handles missing arrays gracefully', () => {
    const ctx = {};
    const fp = contextFingerprint(ctx);
    expect(fp).toBe(';0;0;0');
  });

  it('handles members without activity', () => {
    const ctx = {
      members: [{ agent_id: 'a1', status: 'active' }],
      memories: [],
      messages: [],
      locks: [],
    };
    const fp = contextFingerprint(ctx);
    expect(fp).toContain('a1:active::0');
  });
});

describe('computePollInterval', () => {
  it('returns fast interval with no failures and no idle', () => {
    expect(computePollInterval(0, 0)).toBe(5_000);
  });

  it('returns medium interval for moderate failures (3+)', () => {
    expect(computePollInterval(3, 0)).toBe(15_000);
    expect(computePollInterval(4, 0)).toBe(15_000);
    expect(computePollInterval(5, 0)).toBe(15_000);
  });

  it('returns slow interval for offline-threshold failures (6+)', () => {
    expect(computePollInterval(6, 0)).toBe(30_000);
    expect(computePollInterval(10, 0)).toBe(30_000);
  });

  it('progressively backs off based on idle polls', () => {
    // Tier 1: 6+ idle -> medium
    expect(computePollInterval(0, 6)).toBe(15_000);
    expect(computePollInterval(0, 11)).toBe(15_000);

    // Tier 2: 12+ idle -> slow
    expect(computePollInterval(0, 12)).toBe(30_000);
    expect(computePollInterval(0, 59)).toBe(30_000);

    // Tier 3: 60+ idle -> idle
    expect(computePollInterval(0, 60)).toBe(60_000);
    expect(computePollInterval(0, 100)).toBe(60_000);
  });

  it('failure count takes precedence over idle backoff', () => {
    // Even with high idle, offline failures dominate
    expect(computePollInterval(6, 100)).toBe(30_000);
    // Medium failures override fast idle
    expect(computePollInterval(3, 0)).toBe(15_000);
  });

  it('returns fast for below-threshold values', () => {
    expect(computePollInterval(0, 5)).toBe(5_000);
    expect(computePollInterval(2, 0)).toBe(5_000);
  });
});
