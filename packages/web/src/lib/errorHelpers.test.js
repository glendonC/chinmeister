import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errorHelpers.js';

describe('getErrorMessage', () => {
  it('returns message from Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns fallback for Error with empty message', () => {
    expect(getErrorMessage(new Error(''))).toBe('Something went wrong');
  });

  it('returns the string directly for string values', () => {
    expect(getErrorMessage('network failure')).toBe('network failure');
  });

  it('returns fallback for null', () => {
    expect(getErrorMessage(null)).toBe('Something went wrong');
  });

  it('returns fallback for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('Something went wrong');
  });

  it('returns fallback for numbers', () => {
    expect(getErrorMessage(42)).toBe('Something went wrong');
  });

  it('returns fallback for plain objects', () => {
    expect(getErrorMessage({ message: 'not an Error instance' })).toBe('Something went wrong');
  });

  it('returns fallback for boolean values', () => {
    expect(getErrorMessage(true)).toBe('Something went wrong');
  });

  it('uses custom fallback when provided', () => {
    expect(getErrorMessage(null, 'Custom error')).toBe('Custom error');
    expect(getErrorMessage(undefined, 'Oops')).toBe('Oops');
    expect(getErrorMessage(42, 'Bad input')).toBe('Bad input');
  });

  it('uses custom fallback for Error with empty message', () => {
    expect(getErrorMessage(new Error(''), 'Fallback')).toBe('Fallback');
  });

  it('ignores custom fallback when Error has a message', () => {
    expect(getErrorMessage(new Error('real error'), 'Fallback')).toBe('real error');
  });

  it('returns empty string for empty string input', () => {
    // An empty string is falsy, but typeof is 'string' so it returns it
    expect(getErrorMessage('')).toBe('');
  });
});
