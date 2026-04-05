import { describe, it, expect } from 'vitest';
import { classifyError, classifyInitError, friendlyErrorMessage } from '../utils/errors.js';

// ── classifyInitError ─────────────────────────────────────

describe('classifyInitError', () => {
  it('handles 429 rate limit', () => {
    const result = classifyInitError({ status: 429 });
    expect(result.title).toContain('busy');
    expect(result.hint).toContain('few minutes');
  });

  it('handles 500+ server errors', () => {
    const result = classifyInitError({ status: 500 });
    expect(result.title).toContain('went wrong');
    expect(result.hint).toContain('shortly');
  });

  it('handles 502 server error', () => {
    const result = classifyInitError({ status: 502 });
    expect(result.title).toContain('went wrong');
  });

  it('handles 408 timeout', () => {
    const result = classifyInitError({ status: 408, message: '' });
    expect(result.title).toContain('timed out');
    expect(result.hint).toContain('connection');
  });

  it('handles message-based timeout', () => {
    const result = classifyInitError({ message: 'Request timed out after 5s' });
    expect(result.title).toContain('timed out');
  });

  it('handles network errors (ECONNREFUSED)', () => {
    const result = classifyInitError({ message: 'connect ECONNREFUSED' });
    expect(result.title).toContain('Cannot reach');
    expect(result.hint).toContain('internet');
  });

  it('handles 401 fatal error', () => {
    const result = classifyInitError({ status: 401 });
    // Fatal errors fall through to the generic handler since they don't
    // match any init-specific pattern (not 429, not 500+, not timeout, not non-fatal offline)
    expect(result.title).toBe('Could not connect.');
  });

  it('handles generic unknown error', () => {
    const result = classifyInitError({ message: 'Something weird' });
    expect(result.title).toBe('Could not connect.');
    expect(result.hint).toBe('Something weird');
  });

  it('handles empty/undefined input', () => {
    const result = classifyInitError();
    expect(result.title).toBe('Could not connect.');
  });

  it('handles 403 (non-fatal offline)', () => {
    const result = classifyInitError({ status: 403 });
    expect(result.title).toContain('Cannot reach');
  });

  it('handles 404 (non-fatal offline)', () => {
    const result = classifyInitError({ status: 404 });
    expect(result.title).toContain('Cannot reach');
  });
});

// ── friendlyErrorMessage ──────────────────────────────────

describe('friendlyErrorMessage', () => {
  it('returns specific message for 400 status', () => {
    const result = friendlyErrorMessage({ status: 400 });
    expect(result).toContain('Invalid input');
  });

  it('returns specific message for 409 status', () => {
    const result = friendlyErrorMessage({ status: 409 });
    expect(result).toContain('already exists');
  });

  it('delegates to classifyError for 401', () => {
    const result = friendlyErrorMessage({ status: 401 });
    expect(result).toContain('expired');
  });

  it('delegates to classifyError for 500', () => {
    const result = friendlyErrorMessage({ status: 500 });
    expect(result).toContain('Server error');
  });

  it('delegates to classifyError for 429', () => {
    const result = friendlyErrorMessage({ status: 429 });
    expect(result).toContain('Rate limited');
  });

  it('delegates to classifyError for network errors', () => {
    const result = friendlyErrorMessage({ message: 'ECONNREFUSED' });
    expect(result).toContain('Cannot reach');
  });

  it('uses error message as fallback', () => {
    const result = friendlyErrorMessage({ message: 'Custom error' });
    expect(result).toBe('Custom error');
  });

  it('uses fallback message when no detail available', () => {
    const result = friendlyErrorMessage({}, 'Default fallback');
    // classifyError({}) returns { detail: 'Connection issue. Retrying...' }
    expect(result).toBe('Connection issue. Retrying...');
  });

  it('handles 403 status via classifyError', () => {
    const result = friendlyErrorMessage({ status: 403 });
    expect(result).toContain('Access denied');
  });

  it('handles 404 status via classifyError', () => {
    const result = friendlyErrorMessage({ status: 404 });
    expect(result).toContain('Team not found');
  });
});

// ── classifyError edge cases ──────────────────────────────

describe('classifyError additional coverage', () => {
  it('classifies 409 as error with conflict message', () => {
    const result = classifyError({ status: 409 });
    expect(result.state).toBe('error');
    expect(result.detail).toContain('Conflict');
  });

  it('uses err.code for network error detection', () => {
    const result = classifyError({ code: 'ECONNREFUSED', message: '' });
    expect(result.state).toBe('offline');
    expect(result.detail).toContain('Cannot reach');
  });

  it('uses err.code ENOTFOUND', () => {
    const result = classifyError({ code: 'ENOTFOUND', message: '' });
    expect(result.state).toBe('offline');
  });

  it('uses err.code ECONNRESET', () => {
    const result = classifyError({ code: 'ECONNRESET', message: '' });
    expect(result.state).toBe('offline');
  });

  it('uses err.code EAI_AGAIN', () => {
    const result = classifyError({ code: 'EAI_AGAIN', message: '' });
    expect(result.state).toBe('offline');
  });

  it('non-matching code falls through to message check', () => {
    const result = classifyError({ code: 'EPERM', message: 'permission denied' });
    expect(result.state).toBe('reconnecting');
    expect(result.detail).toBe('permission denied');
  });
});
