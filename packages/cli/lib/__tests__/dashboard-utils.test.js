import { describe, it, expect } from 'vitest';
import { homedir } from 'os';
import {
  truncateText,
  getVisibleWindow,
  formatProjectPath,
  SPINNER,
  MIN_WIDTH,
  DASHBOARD_URL,
} from '../dashboard/utils.js';

describe('truncateText', () => {
  it('returns falsy values unchanged', () => {
    expect(truncateText(null, 10)).toBeNull();
    expect(truncateText('', 10)).toBe('');
    expect(truncateText(undefined, 10)).toBeUndefined();
  });

  it('returns text unchanged if within limit', () => {
    expect(truncateText('hello', 10)).toBe('hello');
    expect(truncateText('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when over limit', () => {
    expect(truncateText('hello world', 6)).toBe('hello\u2026');
    expect(truncateText('abcdefgh', 4)).toBe('abc\u2026');
  });
});

describe('getVisibleWindow', () => {
  it('returns all items when list fits within max', () => {
    const items = ['a', 'b', 'c'];
    const result = getVisibleWindow(items, 0, 5);
    expect(result.items).toEqual(['a', 'b', 'c']);
    expect(result.start).toBe(0);
  });

  it('returns empty for null/empty items', () => {
    expect(getVisibleWindow(null, 0, 5).items).toEqual([]);
    expect(getVisibleWindow([], 0, 5).items).toEqual([]);
  });

  it('returns first window when no selection', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const result = getVisibleWindow(items, -1, 3);
    expect(result.items).toEqual(['a', 'b', 'c']);
    expect(result.start).toBe(0);
  });

  it('centers window around selected item', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const result = getVisibleWindow(items, 5, 4);
    // half = 2, start = 5-2 = 3
    expect(result.start).toBe(3);
    expect(result.items).toEqual(['d', 'e', 'f', 'g']);
  });

  it('clamps window at end of list', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const result = getVisibleWindow(items, 4, 3);
    // Would start at 3, 3+3 > 5? No, 3+3=6>5 so start=max(0,5-3)=2
    expect(result.start).toBe(2);
    expect(result.items).toEqual(['c', 'd', 'e']);
  });

  it('clamps window at start of list', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const result = getVisibleWindow(items, 0, 3);
    expect(result.start).toBe(0);
    expect(result.items).toEqual(['a', 'b', 'c']);
  });
});

describe('formatProjectPath', () => {
  it('replaces home directory with tilde', () => {
    const home = homedir();
    expect(formatProjectPath(`${home}/projects/chinwag`)).toBe('~/projects/chinwag');
  });

  it('returns non-home paths unchanged', () => {
    expect(formatProjectPath('/tmp/project')).toBe('/tmp/project');
  });

  it('handles null/undefined', () => {
    expect(formatProjectPath(null)).toBeNull();
    expect(formatProjectPath(undefined)).toBeUndefined();
  });
});

describe('constants', () => {
  it('exports spinner frames as a non-empty array', () => {
    expect(Array.isArray(SPINNER)).toBe(true);
    expect(SPINNER.length).toBeGreaterThan(0);
  });

  it('exports MIN_WIDTH as a positive number', () => {
    expect(MIN_WIDTH).toBe(50);
  });

  it('exports DASHBOARD_URL', () => {
    expect(typeof DASHBOARD_URL).toBe('string');
    expect(DASHBOARD_URL).toContain('chinwag');
  });
});
