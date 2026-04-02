import { describe, it, expect } from 'vitest';
import { noTeam, errorResult, textResult } from '../utils/responses.js';

describe('response builders', () => {
  describe('noTeam', () => {
    it('returns error result with team membership message', () => {
      const result = noTeam();
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toMatch(/not in a team/i);
    });
  });

  describe('errorResult', () => {
    it('returns error result with the exception message', () => {
      const result = errorResult(new Error('Something broke'));
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Something broke');
    });

    it('returns auth message for 401 errors', () => {
      const err = new Error('Unauthorized');
      err.status = 401;
      const result = errorResult(err);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Authentication expired/);
    });

    it('returns generic message for non-401 status errors', () => {
      const err = new Error('Server error');
      err.status = 500;
      const result = errorResult(err);
      expect(result.content[0].text).toBe('Server error');
    });
  });

  describe('textResult', () => {
    it('returns success result with text content', () => {
      const result = textResult('Operation completed');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Operation completed');
      expect(result.isError).toBeUndefined();
    });

    it('handles empty string', () => {
      const result = textResult('');
      expect(result.content[0].text).toBe('');
    });
  });
});
