import { describe, it, expect } from 'vitest';
import { formatError, formatErrorChain, getHttpStatus, getErrorCode } from '../error-utils.js';

describe('formatError', () => {
  it('extracts message from Error instance', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('returns empty string for Error with empty message', () => {
    expect(formatError(new Error(''))).toBe('');
  });

  it('extracts message from TypeError', () => {
    expect(formatError(new TypeError('type mismatch'))).toBe('type mismatch');
  });

  it('extracts message from RangeError', () => {
    expect(formatError(new RangeError('out of range'))).toBe('out of range');
  });

  it('converts string to itself', () => {
    expect(formatError('oops')).toBe('oops');
  });

  it('converts empty string to empty string', () => {
    expect(formatError('')).toBe('');
  });

  it('converts number to string', () => {
    expect(formatError(42)).toBe('42');
    expect(formatError(0)).toBe('0');
    expect(formatError(-1)).toBe('-1');
    expect(formatError(NaN)).toBe('NaN');
    expect(formatError(Infinity)).toBe('Infinity');
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
    expect(formatError([])).toBe('');
  });

  it('converts Symbol via String()', () => {
    expect(formatError(Symbol('test'))).toBe('Symbol(test)');
  });

  it('converts BigInt via String()', () => {
    expect(formatError(BigInt(123))).toBe('123');
  });

  it('uses custom toString when present on an object', () => {
    const obj = { toString: () => 'custom' };
    expect(formatError(obj)).toBe('custom');
  });

  it('handles Error subclass with custom message', () => {
    class CustomError extends Error {
      constructor() {
        super('custom error');
        this.name = 'CustomError';
      }
    }
    expect(formatError(new CustomError())).toBe('custom error');
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

  it('chains four-deep cause messages', () => {
    const e1 = new Error('a');
    const e2 = new Error('b', { cause: e1 });
    const e3 = new Error('c', { cause: e2 });
    const e4 = new Error('d', { cause: e3 });
    expect(formatErrorChain(e4)).toBe('d <- c <- b <- a');
  });

  it('stops at non-Error cause (string)', () => {
    const outer = new Error('top', { cause: 'not an error' as unknown as Error });
    expect(formatErrorChain(outer)).toBe('top');
  });

  it('stops at non-Error cause (number)', () => {
    const outer = new Error('top', { cause: 42 as unknown as Error });
    expect(formatErrorChain(outer)).toBe('top');
  });

  it('stops at non-Error cause (null)', () => {
    const outer = new Error('top', { cause: null as unknown as Error });
    expect(formatErrorChain(outer)).toBe('top');
  });

  it('stops at non-Error cause (undefined)', () => {
    const outer = new Error('top', { cause: undefined });
    expect(formatErrorChain(outer)).toBe('top');
  });

  it('stops at non-Error cause (plain object)', () => {
    const outer = new Error('top', { cause: { message: 'nope' } as unknown as Error });
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

  it('converts non-Error input (boolean) directly', () => {
    expect(formatErrorChain(true)).toBe('true');
  });

  it('converts non-Error input (object) directly', () => {
    expect(formatErrorChain({ foo: 'bar' })).toBe('[object Object]');
  });

  it('handles Error with no cause property', () => {
    const err = new Error('solo');
    expect(formatErrorChain(err)).toBe('solo');
  });

  it('handles mixed Error subclasses in cause chain', () => {
    const inner = new TypeError('type issue');
    const outer = new RangeError('range issue', { cause: inner });
    expect(formatErrorChain(outer)).toBe('range issue <- type issue');
  });
});

describe('getHttpStatus', () => {
  it('extracts numeric status from Error', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    expect(getHttpStatus(err)).toBe(401);
  });

  it('extracts 200 status', () => {
    const err = Object.assign(new Error('OK'), { status: 200 });
    expect(getHttpStatus(err)).toBe(200);
  });

  it('extracts 500 status', () => {
    const err = Object.assign(new Error('Internal'), { status: 500 });
    expect(getHttpStatus(err)).toBe(500);
  });

  it('extracts 0 status (numeric)', () => {
    const err = Object.assign(new Error('zero'), { status: 0 });
    expect(getHttpStatus(err)).toBe(0);
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

  it('returns undefined for plain object with status (not Error instance)', () => {
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

  it('returns undefined if status is null', () => {
    const err = Object.assign(new Error('bad'), { status: null });
    expect(getHttpStatus(err)).toBeUndefined();
  });

  it('returns undefined if status is undefined', () => {
    const err = Object.assign(new Error('bad'), { status: undefined });
    expect(getHttpStatus(err)).toBeUndefined();
  });

  it('returns undefined if status is an object', () => {
    const err = Object.assign(new Error('bad'), { status: { code: 500 } });
    expect(getHttpStatus(err)).toBeUndefined();
  });

  it('extracts status from Error subclasses', () => {
    const err = Object.assign(new TypeError('type fail'), { status: 422 });
    expect(getHttpStatus(err)).toBe(422);
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

  it('extracts ETIMEDOUT code', () => {
    const err = Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' });
    expect(getErrorCode(err)).toBe('ETIMEDOUT');
  });

  it('extracts empty string code', () => {
    const err = Object.assign(new Error('empty code'), { code: '' });
    expect(getErrorCode(err)).toBe('');
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

  it('returns undefined for plain object with code (not Error instance)', () => {
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

  it('returns undefined if code is null', () => {
    const err = Object.assign(new Error('bad'), { code: null });
    expect(getErrorCode(err)).toBeUndefined();
  });

  it('returns undefined if code is an object', () => {
    const err = Object.assign(new Error('bad'), { code: { name: 'ERR' } });
    expect(getErrorCode(err)).toBeUndefined();
  });

  it('extracts code from Error subclasses', () => {
    const err = Object.assign(new TypeError('type fail'), { code: 'ERR_INVALID_ARG_TYPE' });
    expect(getErrorCode(err)).toBe('ERR_INVALID_ARG_TYPE');
  });
});
