import { describe, it, expect } from 'vitest';
import { formatError, formatErrorChain, getHttpStatus, getErrorCode } from '../error-utils.js';

describe('formatError', () => {
  it('extracts message from Error object', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('extracts message from Error with empty string', () => {
    expect(formatError(new Error(''))).toBe('');
  });

  it('converts string to itself', () => {
    expect(formatError('oops')).toBe('oops');
  });

  it('converts number to string', () => {
    expect(formatError(42)).toBe('42');
    expect(formatError(0)).toBe('0');
    expect(formatError(-1)).toBe('-1');
    expect(formatError(NaN)).toBe('NaN');
  });

  it('converts null to "null"', () => {
    expect(formatError(null)).toBe('null');
  });

  it('converts undefined to "undefined"', () => {
    expect(formatError(undefined)).toBe('undefined');
  });

  it('converts plain objects via String()', () => {
    expect(formatError({})).toBe('[object Object]');
    expect(formatError({ message: 'not an error' })).toBe('[object Object]');
  });

  it('converts boolean values', () => {
    expect(formatError(true)).toBe('true');
    expect(formatError(false)).toBe('false');
  });

  it('converts arrays via String()', () => {
    expect(formatError([1, 2, 3])).toBe('1,2,3');
  });

  it('uses custom toString when present', () => {
    const obj = { toString: () => 'custom' };
    expect(formatError(obj)).toBe('custom');
  });
});

describe('formatErrorChain', () => {
  it('returns message for simple Error', () => {
    expect(formatErrorChain(new Error('top'))).toBe('top');
  });

  it('chains two-deep cause messages with arrow separator', () => {
    const inner = new Error('root');
    const outer = new Error('surface', { cause: inner });
    expect(formatErrorChain(outer)).toBe('surface <- root');
  });

  it('chains three-deep cause messages', () => {
    const e1 = new Error('level-1');
    const e2 = new Error('level-2', { cause: e1 });
    const e3 = new Error('level-3', { cause: e2 });
    expect(formatErrorChain(e3)).toBe('level-3 <- level-2 <- level-1');
  });

  it('stops at non-Error cause (string)', () => {
    const outer = new Error('top', { cause: 'not an error' });
    expect(formatErrorChain(outer)).toBe('top');
  });

  it('stops at non-Error cause (number)', () => {
    const outer = new Error('top', { cause: 42 });
    expect(formatErrorChain(outer)).toBe('top');
  });

  it('stops at non-Error cause (null)', () => {
    const outer = new Error('top', { cause: null });
    expect(formatErrorChain(outer)).toBe('top');
  });

  it('converts non-Error input (string) directly', () => {
    expect(formatErrorChain('just a string')).toBe('just a string');
  });

  it('converts non-Error input (null) directly', () => {
    expect(formatErrorChain(null)).toBe('null');
  });

  it('converts non-Error input (undefined) directly', () => {
    expect(formatErrorChain(undefined)).toBe('undefined');
  });

  it('converts non-Error input (number) directly', () => {
    expect(formatErrorChain(404)).toBe('404');
  });

  it('handles Error with no cause', () => {
    const err = new Error('solo');
    expect(formatErrorChain(err)).toBe('solo');
  });
});

describe('getHttpStatus', () => {
  it('extracts numeric status from Error', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    expect(getHttpStatus(err)).toBe(401);
  });

  it('extracts 500 status', () => {
    const err = Object.assign(new Error('Internal'), { status: 500 });
    expect(getHttpStatus(err)).toBe(500);
  });

  it('returns undefined for Error without status property', () => {
    expect(getHttpStatus(new Error('plain'))).toBeUndefined();
  });

  it('returns undefined for non-Error values', () => {
    expect(getHttpStatus('string')).toBeUndefined();
    expect(getHttpStatus(42)).toBeUndefined();
    expect(getHttpStatus(true)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(getHttpStatus(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(getHttpStatus(undefined)).toBeUndefined();
  });

  it('returns undefined for plain object with status (not Error)', () => {
    expect(getHttpStatus({ status: 500 })).toBeUndefined();
  });

  it('returns undefined if status is a string (not number)', () => {
    const err = Object.assign(new Error('bad'), { status: '500' });
    expect(getHttpStatus(err)).toBeUndefined();
  });

  it('returns undefined if status is boolean', () => {
    const err = Object.assign(new Error('bad'), { status: true });
    expect(getHttpStatus(err)).toBeUndefined();
  });
});

describe('getErrorCode', () => {
  it('extracts string code from Error', () => {
    const err = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });
    expect(getErrorCode(err)).toBe('ECONNREFUSED');
  });

  it('extracts ENOENT code', () => {
    const err = Object.assign(new Error('File not found'), { code: 'ENOENT' });
    expect(getErrorCode(err)).toBe('ENOENT');
  });

  it('returns undefined for Error without code property', () => {
    expect(getErrorCode(new Error('plain'))).toBeUndefined();
  });

  it('returns undefined for non-Error values', () => {
    expect(getErrorCode('string')).toBeUndefined();
    expect(getErrorCode(42)).toBeUndefined();
    expect(getErrorCode(true)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(getErrorCode(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(getErrorCode(undefined)).toBeUndefined();
  });

  it('returns undefined for plain object with code (not Error)', () => {
    expect(getErrorCode({ code: 'ENOENT' })).toBeUndefined();
  });

  it('returns undefined if code is a number (not string)', () => {
    const err = Object.assign(new Error('bad'), { code: 42 });
    expect(getErrorCode(err)).toBeUndefined();
  });

  it('returns undefined if code is boolean', () => {
    const err = Object.assign(new Error('bad'), { code: true });
    expect(getErrorCode(err)).toBeUndefined();
  });
});
