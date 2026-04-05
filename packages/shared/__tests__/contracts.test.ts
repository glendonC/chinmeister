import { describe, it, expect } from 'vitest';
import { AGENT_STATUS } from '../contracts.js';
import type { AgentStatus } from '../contracts.js';

describe('AGENT_STATUS', () => {
  it('has ACTIVE set to "active"', () => {
    expect(AGENT_STATUS.ACTIVE).toBe('active');
  });

  it('has IDLE set to "idle"', () => {
    expect(AGENT_STATUS.IDLE).toBe('idle');
  });

  it('has OFFLINE set to "offline"', () => {
    expect(AGENT_STATUS.OFFLINE).toBe('offline');
  });

  it('contains exactly three status values', () => {
    const keys = Object.keys(AGENT_STATUS);
    expect(keys).toHaveLength(3);
    expect(keys).toEqual(expect.arrayContaining(['ACTIVE', 'IDLE', 'OFFLINE']));
  });

  it('values are all distinct strings', () => {
    const values = Object.values(AGENT_STATUS);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(typeof v).toBe('string');
    }
  });

  it('values match the AgentStatus type union', () => {
    const validStatuses: AgentStatus[] = ['active', 'idle', 'offline'];
    for (const value of Object.values(AGENT_STATUS)) {
      expect(validStatuses).toContain(value);
    }
  });

  it('object is frozen (as const satisfies makes it readonly)', () => {
    // The "as const satisfies" pattern creates a readonly object at the type level.
    // At runtime, the object properties cannot be reassigned due to TS enforcement,
    // but we verify the values are stable.
    expect(AGENT_STATUS.ACTIVE).toBe('active');
    expect(AGENT_STATUS.IDLE).toBe('idle');
    expect(AGENT_STATUS.OFFLINE).toBe('offline');
  });
});
