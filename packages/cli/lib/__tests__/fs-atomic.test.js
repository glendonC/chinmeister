import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileAtomicSync } from '../fs-atomic.js';

describe('writeFileAtomicSync', () => {
  let dir;

  beforeEach(() => {
    dir = join(tmpdir(), `chinwag-atomic-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('writes content to target path', () => {
    const target = join(dir, 'out.json');
    writeFileAtomicSync(target, '{"hello":"world"}');
    expect(readFileSync(target, 'utf-8')).toBe('{"hello":"world"}');
  });

  it('creates parent directory if missing', () => {
    const target = join(dir, 'nested', 'deep', 'out.json');
    writeFileAtomicSync(target, 'x');
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf-8')).toBe('x');
  });

  it('replaces existing content atomically', () => {
    const target = join(dir, 'out.json');
    writeFileSync(target, 'old content');
    writeFileAtomicSync(target, 'new content');
    expect(readFileSync(target, 'utf-8')).toBe('new content');
  });

  it('does not leave tmp files after successful write', () => {
    const target = join(dir, 'out.json');
    writeFileAtomicSync(target, 'data');
    const leftover = readdirSync(dir).filter((f) => f.includes('.tmp'));
    expect(leftover).toEqual([]);
  });

  it('accepts Buffer input', () => {
    const target = join(dir, 'out.bin');
    writeFileAtomicSync(target, Buffer.from([0x01, 0x02, 0x03]));
    const data = readFileSync(target);
    expect(Array.from(data)).toEqual([0x01, 0x02, 0x03]);
  });

  it('leaves target untouched if rename fails', () => {
    const target = join(dir, 'out.json');
    writeFileSync(target, 'original');
    // Simulate a rename failure by making the target path a directory.
    const badTarget = join(dir, 'baddir');
    mkdirSync(badTarget);
    // Write a file inside baddir to ensure it's non-empty (rename-over-dir fails).
    writeFileSync(join(badTarget, 'child'), 'x');
    expect(() => writeFileAtomicSync(badTarget, 'new')).toThrow();
    // Original file is untouched.
    expect(readFileSync(target, 'utf-8')).toBe('original');
    // Tmp cleanup happened.
    const leftover = readdirSync(dir).filter((f) => f.startsWith('baddir.') && f.endsWith('.tmp'));
    expect(leftover).toEqual([]);
  });
});
