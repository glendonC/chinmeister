import { describe, it, expect } from 'vitest';
import { isRecord, toChatMessage, toChatMessages } from '../chat.js';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns true for arrays (typeof object && !== null)', () => {
    // isRecord is a minimal null guard, not a strict plain-object check.
    // Arrays pass because typeof [] === 'object'. This is fine for its
    // usage in toChatMessage which checks for specific string properties.
    expect(isRecord([])).toBe(true);
    expect(isRecord([1, 2])).toBe(true);
  });

  it('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('toChatMessage', () => {
  it('converts valid message object with all fields', () => {
    const input = {
      type: 'message',
      content: 'hello',
      handle: 'alice',
      color: 'cyan',
      timestamp: '2026-01-01T00:00:00Z',
    };
    expect(toChatMessage(input)).toEqual(input);
  });

  it('converts message with only required type field', () => {
    const result = toChatMessage({ type: 'system' });
    expect(result).toEqual({
      type: 'system',
      content: undefined,
      handle: undefined,
      color: undefined,
      timestamp: undefined,
    });
  });

  it('returns null for non-object input', () => {
    expect(toChatMessage(null)).toBeNull();
    expect(toChatMessage(undefined)).toBeNull();
    expect(toChatMessage('string')).toBeNull();
    expect(toChatMessage(42)).toBeNull();
  });

  it('returns null when type is missing', () => {
    expect(toChatMessage({ content: 'hello' })).toBeNull();
  });

  it('returns null when type is not a string', () => {
    expect(toChatMessage({ type: 123 })).toBeNull();
    expect(toChatMessage({ type: null })).toBeNull();
    expect(toChatMessage({ type: true })).toBeNull();
  });

  it('ignores non-string optional fields', () => {
    const result = toChatMessage({
      type: 'message',
      content: 123,
      handle: null,
      color: [],
      timestamp: {},
    });
    expect(result).toEqual({
      type: 'message',
      content: undefined,
      handle: undefined,
      color: undefined,
      timestamp: undefined,
    });
  });
});

describe('toChatMessages', () => {
  it('converts array of valid messages', () => {
    const input = [
      { type: 'message', content: 'a' },
      { type: 'system', content: 'b' },
    ];
    const result = toChatMessages(input);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('a');
    expect(result[1].content).toBe('b');
  });

  it('returns empty array for non-array input', () => {
    expect(toChatMessages(null)).toEqual([]);
    expect(toChatMessages(undefined)).toEqual([]);
    expect(toChatMessages('string')).toEqual([]);
    expect(toChatMessages(42)).toEqual([]);
    expect(toChatMessages({})).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(toChatMessages([])).toEqual([]);
  });

  it('filters out invalid messages from mixed array', () => {
    const input = [
      { type: 'message', content: 'valid' },
      null,
      'not an object',
      { no_type: true },
      { type: 'system' },
    ];
    const result = toChatMessages(input);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('valid');
    expect(result[1].type).toBe('system');
  });
});
