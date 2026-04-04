import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime } from './relativeTime.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime', () => {
  it('returns null for null input', () => {
    expect(formatRelativeTime(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatRelativeTime(undefined)).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(formatRelativeTime('not-a-date')).toBeNull();
  });

  it('returns "just now" for less than 10 seconds ago', () => {
    const date = new Date(Date.now() - 5_000);
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns "just now" for exactly now', () => {
    const date = new Date(Date.now());
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns seconds for 10-59 seconds ago', () => {
    const date10 = new Date(Date.now() - 10_000);
    expect(formatRelativeTime(date10)).toBe('10s ago');

    const date45 = new Date(Date.now() - 45_000);
    expect(formatRelativeTime(date45)).toBe('45s ago');

    const date59 = new Date(Date.now() - 59_000);
    expect(formatRelativeTime(date59)).toBe('59s ago');
  });

  it('returns minutes for 1-59 minutes ago', () => {
    const date1m = new Date(Date.now() - 60_000);
    expect(formatRelativeTime(date1m)).toBe('1m ago');

    const date30m = new Date(Date.now() - 30 * 60_000);
    expect(formatRelativeTime(date30m)).toBe('30m ago');

    const date59m = new Date(Date.now() - 59 * 60_000);
    expect(formatRelativeTime(date59m)).toBe('59m ago');
  });

  it('returns hours for 1-23 hours ago', () => {
    const date1h = new Date(Date.now() - 60 * 60_000);
    expect(formatRelativeTime(date1h)).toBe('1h ago');

    const date12h = new Date(Date.now() - 12 * 60 * 60_000);
    expect(formatRelativeTime(date12h)).toBe('12h ago');

    const date23h = new Date(Date.now() - 23 * 60 * 60_000);
    expect(formatRelativeTime(date23h)).toBe('23h ago');
  });

  it('returns days for 1+ days ago', () => {
    const date1d = new Date(Date.now() - 24 * 60 * 60_000);
    expect(formatRelativeTime(date1d)).toBe('1d ago');

    const date6d = new Date(Date.now() - 6 * 24 * 60 * 60_000);
    expect(formatRelativeTime(date6d)).toBe('6d ago');

    const date30d = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    expect(formatRelativeTime(date30d)).toBe('30d ago');
  });

  it('accepts ISO date strings', () => {
    // 5 minutes before the fixed system time
    expect(formatRelativeTime('2026-04-04T11:55:00Z')).toBe('5m ago');
  });

  it('accepts Date objects', () => {
    const date = new Date('2026-04-04T11:30:00Z');
    expect(formatRelativeTime(date)).toBe('30m ago');
  });

  it('treats future dates as "just now" (clamped to 0)', () => {
    const futureDate = new Date(Date.now() + 60_000);
    expect(formatRelativeTime(futureDate)).toBe('just now');
  });
});
