import { describe, it, expect } from 'vitest';
import { formatError, formatErrorChain, getHttpStatus, getErrorCode } from '../error-utils.js';

describe('formatError', () => {
  it('extracts message from Error', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('converts non-Error to string', () => {
    expect(formatError('oops')).toBe('oops');
    expect(formatError(42)).toBe('42');
    expect(formatError(null)).toBe('null');
    expect(formatError(undefined)).toBe('undefined');
  });
});

describe('formatErrorChain', () => {
  it('returns message for simple Error', () => {
    expect(formatErrorChain(new Error('top'))).toBe('top');
  });

  it('chains cause messages with arrow separator', () => {
    const inner = new Error('root');
    const outer = new Error('surface', { cause: inner });
    expect(formatErrorChain(outer)).toBe('surface <- root');
  });

  it('handles deep cause chains', () => {
    const e1 = new Error('level-1');
    const e2 = new Error('level-2', { cause: e1 });
    const e3 = new Error('level-3', { cause: e2 });
    expect(formatErrorChain(e3)).toBe('level-3 <- level-2 <- level-1');
  });

  it('stops at non-Error cause', () => {
    const outer = new Error('top', { cause: 'not an error' });
    expect(formatErrorChain(outer)).toBe('top');
  });

  it('converts non-Error to string', () => {
    expect(formatErrorChain('just a string')).toBe('just a string');
    expect(formatErrorChain(null)).toBe('null');
  });
});

describe('getHttpStatus', () => {
  it('extracts status from Error with status property', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    expect(getHttpStatus(err)).toBe(401);
  });

  it('returns undefined for Error without status', () => {
    expect(getHttpStatus(new Error('plain'))).toBeUndefined();
  });

  it('returns undefined for non-Error values', () => {
    expect(getHttpStatus('string')).toBeUndefined();
    expect(getHttpStatus(null)).toBeUndefined();
    expect(getHttpStatus({ status: 500 })).toBeUndefined();
  });

  it('returns undefined if status is not a number', () => {
    const err = Object.assign(new Error('bad'), { status: '500' });
    expect(getHttpStatus(err)).toBeUndefined();
  });
});

describe('getErrorCode', () => {
  it('extracts code from Error with code property', () => {
    const err = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });
    expect(getErrorCode(err)).toBe('ECONNREFUSED');
  });

  it('returns undefined for Error without code', () => {
    expect(getErrorCode(new Error('plain'))).toBeUndefined();
  });

  it('returns undefined for non-Error values', () => {
    expect(getErrorCode('string')).toBeUndefined();
    expect(getErrorCode(null)).toBeUndefined();
    expect(getErrorCode({ code: 'ENOENT' })).toBeUndefined();
  });

  it('returns undefined if code is not a string', () => {
    const err = Object.assign(new Error('bad'), { code: 42 });
    expect(getErrorCode(err)).toBeUndefined();
  });
});
