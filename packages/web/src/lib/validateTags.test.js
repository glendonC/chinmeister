import { describe, expect, it } from 'vitest';
import { validateTags, MAX_TAG_LENGTH, MAX_TAGS_COUNT } from './validateTags.js';

describe('validateTags', () => {
  it('parses comma-separated tags into lowercase array', () => {
    const { tags, error } = validateTags('Auth, API, Backend');
    expect(error).toBeNull();
    expect(tags).toEqual(['auth', 'api', 'backend']);
  });

  it('strips special characters (keeps alphanumeric, hyphens, underscores)', () => {
    const { tags, error } = validateTags('hello@world, foo!bar#baz, my_tag-1');
    expect(error).toBeNull();
    expect(tags).toEqual(['helloworld', 'foobarbaz', 'my_tag-1']);
  });

  it('removes empty tags after stripping', () => {
    const { tags, error } = validateTags('@@@, !!!, good-tag');
    expect(error).toBeNull();
    expect(tags).toEqual(['good-tag']);
  });

  it('deduplicates tags while preserving order', () => {
    const { tags, error } = validateTags('auth, api, Auth, API');
    expect(error).toBeNull();
    expect(tags).toEqual(['auth', 'api']);
  });

  it('returns empty array for empty input', () => {
    const { tags, error } = validateTags('');
    expect(error).toBeNull();
    expect(tags).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    const { tags, error } = validateTags('  ,  ,  ');
    expect(error).toBeNull();
    expect(tags).toEqual([]);
  });

  it(`rejects more than ${MAX_TAGS_COUNT} tags`, () => {
    const raw = Array.from({ length: MAX_TAGS_COUNT + 1 }, (_, i) => `tag${i}`).join(', ');
    const { tags, error } = validateTags(raw);
    expect(error).toBe(`Maximum ${MAX_TAGS_COUNT} tags allowed`);
    expect(tags).toEqual([]);
  });

  it(`allows exactly ${MAX_TAGS_COUNT} tags`, () => {
    const raw = Array.from({ length: MAX_TAGS_COUNT }, (_, i) => `tag${i}`).join(', ');
    const { tags, error } = validateTags(raw);
    expect(error).toBeNull();
    expect(tags).toHaveLength(MAX_TAGS_COUNT);
  });

  it(`rejects tags exceeding ${MAX_TAG_LENGTH} characters`, () => {
    const longTag = 'a'.repeat(MAX_TAG_LENGTH + 1);
    const { tags, error } = validateTags(longTag);
    expect(error).toMatch(/exceeds.*characters/);
    expect(tags).toEqual([]);
  });

  it(`allows tags exactly ${MAX_TAG_LENGTH} characters`, () => {
    const exactTag = 'a'.repeat(MAX_TAG_LENGTH);
    const { tags, error } = validateTags(exactTag);
    expect(error).toBeNull();
    expect(tags).toEqual([exactTag]);
  });

  it('strips special characters before length check', () => {
    // 55 chars with specials, but under 50 after stripping
    const raw = 'a!b@c#d$e%'.repeat(5); // 50 chars raw, 25 after stripping
    const { tags, error } = validateTags(raw);
    expect(error).toBeNull();
    expect(tags[0]).toHaveLength(25);
  });

  it('handles mixed valid and empty tags', () => {
    const { tags, error } = validateTags('valid, , , also-valid');
    expect(error).toBeNull();
    expect(tags).toEqual(['valid', 'also-valid']);
  });

  it('matches worker backend constants', () => {
    // These must stay in sync with packages/worker/src/lib/constants.js
    expect(MAX_TAG_LENGTH).toBe(50);
    expect(MAX_TAGS_COUNT).toBe(10);
  });
});
