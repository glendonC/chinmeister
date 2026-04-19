import { describe, it, expect } from 'vitest';
import { globToRegExp, matchesGlob, isGlobPattern } from '../lib/glob.js';

describe('isGlobPattern', () => {
  it('flags glob metacharacters', () => {
    expect(isGlobPattern('src/auth/**')).toBe(true);
    expect(isGlobPattern('*.ts')).toBe(true);
    expect(isGlobPattern('foo?.ts')).toBe(true);
    expect(isGlobPattern('src/[abc].ts')).toBe(true);
  });

  it('returns false for plain paths', () => {
    expect(isGlobPattern('src/auth/tokens.ts')).toBe(false);
    expect(isGlobPattern('README.md')).toBe(false);
    expect(isGlobPattern('')).toBe(false);
  });
});

describe('matchesGlob', () => {
  it('matches single-star within one directory segment', () => {
    expect(matchesGlob('src/auth.ts', 'src/*.ts')).toBe(true);
    expect(matchesGlob('src/auth/tokens.ts', 'src/*.ts')).toBe(false);
  });

  it('matches double-star across directory spans', () => {
    expect(matchesGlob('src/auth/tokens.ts', 'src/**/*.ts')).toBe(true);
    expect(matchesGlob('src/deep/nested/file.ts', 'src/**')).toBe(true);
    expect(matchesGlob('other/file.ts', 'src/**')).toBe(false);
  });

  it('handles a leading double-star as "anywhere"', () => {
    expect(matchesGlob('a/b/foo', '**/foo')).toBe(true);
    expect(matchesGlob('foo', '**/foo')).toBe(true);
    expect(matchesGlob('foo.txt', '**/foo')).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    // A dot in the pattern should only match a literal dot, not any char.
    expect(matchesGlob('foo.ts', 'foo.ts')).toBe(true);
    expect(matchesGlob('fooxts', 'foo.ts')).toBe(false);
  });

  it('normalises leading slashes on both sides', () => {
    expect(matchesGlob('/src/auth/tokens.ts', 'src/auth/**')).toBe(true);
    expect(matchesGlob('src/auth/tokens.ts', '/src/auth/**')).toBe(true);
  });

  it('matches literal paths as themselves', () => {
    expect(matchesGlob('README.md', 'README.md')).toBe(true);
    expect(matchesGlob('readme.md', 'README.md')).toBe(false);
  });

  it('question-mark matches exactly one non-slash char', () => {
    expect(matchesGlob('src/a.ts', 'src/?.ts')).toBe(true);
    expect(matchesGlob('src/ab.ts', 'src/?.ts')).toBe(false);
    expect(matchesGlob('src//b.ts', 'src/?.ts')).toBe(false);
  });
});

describe('globToRegExp', () => {
  it('returns a RegExp anchored at both ends', () => {
    const re = globToRegExp('foo');
    expect(re.test('foo')).toBe(true);
    expect(re.test('xfoo')).toBe(false);
    expect(re.test('foox')).toBe(false);
  });
});
