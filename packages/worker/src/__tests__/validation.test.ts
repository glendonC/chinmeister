import { describe, it, expect, vi } from 'vitest';

// Mock cloudflare:workers so DO class imports resolve outside the Workers runtime
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

import {
  validateFileArray,
  validateTagsArray,
  requireString,
  requireArray,
  sanitizeString,
  requireJson,
  buildInClause,
  isUUID,
  hashIp,
} from '../lib/validation.js';

// --- validateFileArray ---

describe('validateFileArray', () => {
  it('returns null for valid file array', () => {
    expect(validateFileArray(['src/a.js', 'src/b.js'], 20)).toBeNull();
  });

  it('rejects non-array input', () => {
    expect(validateFileArray('src/a.js', 20)).toBe('files must be a non-empty array');
    expect(validateFileArray(null, 20)).toBe('files must be a non-empty array');
    expect(validateFileArray(42, 20)).toBe('files must be a non-empty array');
    expect(validateFileArray({}, 20)).toBe('files must be a non-empty array');
  });

  it('rejects empty array', () => {
    expect(validateFileArray([], 20)).toBe('files must be a non-empty array');
  });

  it('rejects too many files', () => {
    const files = Array.from({ length: 25 }, (_, i) => `file${i}.js`);
    expect(validateFileArray(files, 20)).toBe('too many files (max 20)');
  });

  it('rejects non-string entries', () => {
    expect(validateFileArray([42, 'valid.js'], 20)).toBe('invalid file path');
    expect(validateFileArray([null], 20)).toBe('invalid file path');
  });

  it('rejects file paths exceeding 500 chars', () => {
    expect(validateFileArray(['a'.repeat(501)], 20)).toBe('invalid file path');
  });

  it('accepts file path at exactly 500 chars', () => {
    expect(validateFileArray(['a'.repeat(500)], 20)).toBeNull();
  });

  it('rejects paths containing null bytes', () => {
    expect(validateFileArray(['src/\0evil.js'], 20)).toBe('invalid file path');
  });

  it('rejects absolute paths (leading /)', () => {
    expect(validateFileArray(['/etc/passwd'], 20)).toBe('invalid file path');
  });

  it('rejects paths with backslashes', () => {
    expect(validateFileArray(['src\\evil.js'], 20)).toBe('invalid file path');
  });

  it('accepts a single file', () => {
    expect(validateFileArray(['file.js'], 20)).toBeNull();
  });

  it('accepts files at exactly the max count', () => {
    const files = Array.from({ length: 20 }, (_, i) => `file${i}.js`);
    expect(validateFileArray(files, 20)).toBeNull();
  });

  it('allows null/undefined with nullable option', () => {
    expect(validateFileArray(null, 20, { nullable: true })).toBeNull();
    expect(validateFileArray(undefined, 20, { nullable: true })).toBeNull();
  });

  it('still validates contents when nullable but array provided', () => {
    expect(validateFileArray([], 20, { nullable: true })).toBe('files must be a non-empty array');
  });
});

// --- validateTagsArray ---

describe('validateTagsArray', () => {
  it('returns empty array for null or undefined', () => {
    expect(validateTagsArray(null, 10)).toEqual({ tags: [] });
    expect(validateTagsArray(undefined, 10)).toEqual({ tags: [] });
  });

  it('returns error for non-array input', () => {
    expect(validateTagsArray('config', 10)).toEqual({ error: 'tags must be an array of strings' });
    expect(validateTagsArray(42, 10)).toEqual({ error: 'tags must be an array of strings' });
    expect(validateTagsArray({}, 10)).toEqual({ error: 'tags must be an array of strings' });
  });

  it('returns error when too many tags', () => {
    const tags = Array.from({ length: 15 }, (_, i) => `tag${i}`);
    expect(validateTagsArray(tags, 10)).toEqual({ error: 'max 10 tags' });
  });

  it('returns error for tags exceeding 50 chars', () => {
    expect(validateTagsArray(['a'.repeat(51)], 10)).toEqual({
      error: 'each tag must be a string of 50 chars or less',
    });
  });

  it('returns error for non-string tags', () => {
    expect(validateTagsArray([42], 10)).toEqual({
      error: 'each tag must be a string of 50 chars or less',
    });
  });

  it('lowercases and trims valid tags', () => {
    expect(validateTagsArray(['  Config  ', 'PATTERN'], 10)).toEqual({
      tags: ['config', 'pattern'],
    });
  });

  it('filters out tags that become empty after trimming', () => {
    expect(validateTagsArray(['  ', '', 'valid'], 10)).toEqual({ tags: ['valid'] });
  });

  it('accepts empty array', () => {
    expect(validateTagsArray([], 10)).toEqual({ tags: [] });
  });

  it('accepts tags at exactly the max count', () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    const result = validateTagsArray(tags, 10);
    expect(result.tags).toHaveLength(10);
  });

  it('preserves original order of tags', () => {
    expect(validateTagsArray(['zebra', 'apple', 'mango'], 10)).toEqual({
      tags: ['zebra', 'apple', 'mango'],
    });
  });
});

// --- requireString ---

describe('requireString', () => {
  it('returns trimmed string for valid input', () => {
    expect(requireString({ name: '  hello  ' }, 'name')).toBe('hello');
  });

  it('returns null for missing field', () => {
    expect(requireString({}, 'name')).toBeNull();
  });

  it('returns null for non-string field', () => {
    expect(requireString({ name: 42 }, 'name')).toBeNull();
    expect(requireString({ name: null }, 'name')).toBeNull();
    expect(requireString({ name: true }, 'name')).toBeNull();
    expect(requireString({ name: [] }, 'name')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(requireString({ name: '' }, 'name')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(requireString({ name: '   ' }, 'name')).toBeNull();
  });

  it('returns null when value exceeds maxLength', () => {
    expect(requireString({ name: 'a'.repeat(51) }, 'name', 50)).toBeNull();
  });

  it('returns string when within maxLength', () => {
    expect(requireString({ name: 'a'.repeat(50) }, 'name', 50)).toBe('a'.repeat(50));
  });

  it('works without maxLength parameter', () => {
    expect(requireString({ name: 'a'.repeat(10000) }, 'name')).toBe('a'.repeat(10000));
  });

  it('trims before returning', () => {
    expect(requireString({ x: '  spaced  ' }, 'x')).toBe('spaced');
  });
});

// --- requireArray ---

describe('requireArray', () => {
  it('returns array for valid input', () => {
    expect(requireArray({ files: ['a.js', 'b.js'] }, 'files', 10)).toEqual(['a.js', 'b.js']);
  });

  it('returns null for missing field', () => {
    expect(requireArray({}, 'files', 10)).toBeNull();
  });

  it('returns null for non-array field', () => {
    expect(requireArray({ files: 'a.js' }, 'files', 10)).toBeNull();
    expect(requireArray({ files: null }, 'files', 10)).toBeNull();
    expect(requireArray({ files: 42 }, 'files', 10)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(requireArray({ files: [] }, 'files', 10)).toBeNull();
  });

  it('returns null when array exceeds maxItems', () => {
    expect(requireArray({ files: ['a', 'b', 'c'] }, 'files', 2)).toBeNull();
  });

  it('returns array when at maxItems', () => {
    expect(requireArray({ files: ['a', 'b'] }, 'files', 2)).toEqual(['a', 'b']);
  });

  it('allows mixed-type arrays (does not filter entries)', () => {
    const result = requireArray({ items: [1, 'two', null] }, 'items', 10);
    expect(result).toEqual([1, 'two', null]);
  });
});

// --- sanitizeString ---

describe('sanitizeString', () => {
  it('returns trimmed string within max length', () => {
    expect(sanitizeString('  hello  ', 50)).toBe('hello');
  });

  it('truncates to maxLength before trimming', () => {
    expect(sanitizeString('a'.repeat(100), 10)).toBe('a'.repeat(10));
  });

  it('returns null for non-string input', () => {
    expect(sanitizeString(42, 50)).toBeNull();
    expect(sanitizeString(null, 50)).toBeNull();
    expect(sanitizeString(undefined, 50)).toBeNull();
    expect(sanitizeString(true, 50)).toBeNull();
    expect(sanitizeString([], 50)).toBeNull();
  });

  it('returns null for string that becomes empty after trim', () => {
    expect(sanitizeString('   ', 50)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeString('', 50)).toBeNull();
  });

  it('preserves content within maxLength', () => {
    expect(sanitizeString('valid', 10)).toBe('valid');
  });
});

// --- requireJson ---

describe('requireJson', () => {
  it('returns null for body without parse error', () => {
    expect(requireJson({ key: 'value' })).toBeNull();
  });

  it('returns 400 response for body with parse error', () => {
    const result = requireJson({ _parseError: 'Invalid JSON body' });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it('returns null for normal body with other underscore-prefixed keys', () => {
    // Only _parseError triggers the error
    expect(requireJson({ _other: 'fine', key: 'value' })).toBeNull();
  });
});

// --- buildInClause ---

describe('buildInClause', () => {
  it('builds placeholders for multiple items', () => {
    const result = buildInClause(['a', 'b', 'c']);
    expect(result.sql).toBe('?,?,?');
    expect(result.params).toEqual(['a', 'b', 'c']);
  });

  it('builds single placeholder', () => {
    const result = buildInClause(['x']);
    expect(result.sql).toBe('?');
    expect(result.params).toEqual(['x']);
  });

  it('returns none-matching literal for empty array', () => {
    const result = buildInClause([]);
    expect(result.sql).toBe("'__none__'");
    expect(result.params).toEqual([]);
  });

  it('returns none-matching literal for null-ish input', () => {
    const result = buildInClause(null as unknown as unknown[]);
    expect(result.sql).toBe("'__none__'");
    expect(result.params).toEqual([]);
  });

  it('handles numeric items', () => {
    const result = buildInClause([1, 2, 3]);
    expect(result.sql).toBe('?,?,?');
    expect(result.params).toEqual([1, 2, 3]);
  });
});

// --- isUUID ---

describe('isUUID', () => {
  it('returns true for valid UUID v4', () => {
    expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('returns true for lowercase UUID', () => {
    expect(isUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('returns true for uppercase UUID', () => {
    expect(isUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
  });

  it('returns false for non-string input', () => {
    expect(isUUID(42)).toBe(false);
    expect(isUUID(null)).toBe(false);
    expect(isUUID(undefined)).toBe(false);
    expect(isUUID({})).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isUUID('')).toBe(false);
  });

  it('returns false for UUID without dashes', () => {
    expect(isUUID('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('returns false for UUID with extra characters', () => {
    expect(isUUID('550e8400-e29b-41d4-a716-446655440000x')).toBe(false);
  });

  it('returns false for too-short UUID', () => {
    expect(isUUID('550e8400-e29b-41d4-a716')).toBe(false);
  });
});

// --- hashIp ---

describe('hashIp', () => {
  it('returns a 16-character hex string', async () => {
    const result = await hashIp('192.168.1.1');
    expect(result).toMatch(/^[0-9a-f]{16}$/);
    expect(result).toHaveLength(16);
  });

  it('returns consistent hash for same input', async () => {
    const first = await hashIp('10.0.0.1');
    const second = await hashIp('10.0.0.1');
    expect(first).toBe(second);
  });

  it('returns different hashes for different IPs', async () => {
    const a = await hashIp('192.168.1.1');
    const b = await hashIp('192.168.1.2');
    expect(a).not.toBe(b);
  });

  it('handles IPv6 addresses', async () => {
    const result = await hashIp('::1');
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });
});
