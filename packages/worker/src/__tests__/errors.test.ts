import { describe, it, expect, vi } from 'vitest';

// Mock cloudflare:workers so DO class imports resolve outside the Workers runtime
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

import { getErrorMessage, isDOError } from '../lib/errors.js';

// --- getErrorMessage ---

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe('something broke');
  });

  it('extracts message from TypeError', () => {
    expect(getErrorMessage(new TypeError('type mismatch'))).toBe('type mismatch');
  });

  it('converts a plain string to itself', () => {
    expect(getErrorMessage('raw error string')).toBe('raw error string');
  });

  it('converts a number to string', () => {
    expect(getErrorMessage(42)).toBe('42');
  });

  it('converts null to string', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('converts undefined to string', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('converts an object to string representation', () => {
    expect(getErrorMessage({ message: 'oops' })).toBe('[object Object]');
  });

  it('converts a boolean to string', () => {
    expect(getErrorMessage(false)).toBe('false');
  });

  it('handles Error with empty message', () => {
    expect(getErrorMessage(new Error(''))).toBe('');
  });

  it('handles Error subclass', () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'CustomError';
      }
    }
    expect(getErrorMessage(new CustomError('custom'))).toBe('custom');
  });
});

// --- isDOError ---

describe('isDOError', () => {
  it('returns true for a standard DO error object', () => {
    expect(isDOError({ error: 'Not a member' })).toBe(true);
  });

  it('returns true for DO error with code field', () => {
    expect(isDOError({ error: 'Not found', code: 'NOT_FOUND' })).toBe(true);
  });

  it('returns true for DO error with extra fields', () => {
    expect(isDOError({ error: 'Conflict', code: 'CONFLICT', extra: true })).toBe(true);
  });

  it('returns false for DO success object (no error field)', () => {
    expect(isDOError({ ok: true, data: 'something' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDOError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isDOError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isDOError('error string')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isDOError(404)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isDOError(['error'])).toBe(false);
  });

  it('returns false when error field is not a string', () => {
    expect(isDOError({ error: 42 })).toBe(false);
    expect(isDOError({ error: null })).toBe(false);
    expect(isDOError({ error: true })).toBe(false);
    expect(isDOError({ error: ['msg'] })).toBe(false);
    expect(isDOError({ error: { message: 'nested' } })).toBe(false);
  });

  it('returns true for empty error string', () => {
    // An empty string is still typeof 'string'
    expect(isDOError({ error: '' })).toBe(true);
  });
});
