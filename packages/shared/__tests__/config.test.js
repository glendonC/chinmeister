import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import { configExists, loadConfig, CONFIG_DIR, CONFIG_FILE } from '../config.js';
import { existsSync, readFileSync } from 'fs';

describe('config', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('CONFIG_DIR and CONFIG_FILE', () => {
    it('CONFIG_DIR points to ~/.chinwag', () => {
      expect(CONFIG_DIR).toBe('/home/testuser/.chinwag');
    });

    it('CONFIG_FILE points to ~/.chinwag/config.json', () => {
      expect(CONFIG_FILE).toBe('/home/testuser/.chinwag/config.json');
    });
  });

  describe('configExists', () => {
    it('returns true when config file exists', () => {
      existsSync.mockReturnValue(true);
      expect(configExists()).toBe(true);
    });

    it('returns false when config file does not exist', () => {
      existsSync.mockReturnValue(false);
      expect(configExists()).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('returns null when config file does not exist', () => {
      existsSync.mockReturnValue(false);
      expect(loadConfig()).toBeNull();
    });

    it('returns parsed config when file exists and is valid JSON', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(
        JSON.stringify({
          token: 'test-token',
          handle: 'alice',
        }),
      );
      const config = loadConfig();
      expect(config).toEqual({ token: 'test-token', handle: 'alice' });
    });

    it('returns null when file is corrupted (invalid JSON)', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('not json!!!');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const config = loadConfig();
      expect(config).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
      consoleSpy.mockRestore();
    });

    it('returns empty object when file contains valid JSON empty object', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('{}');
      expect(loadConfig()).toEqual({});
    });

    it('returns null when file contains a non-object JSON value', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('[1,2,3]');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(loadConfig()).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('invalid shape'));
      consoleSpy.mockRestore();
    });

    it('returns null when a known field has the wrong type', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({ token: 123 }));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(loadConfig()).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"token" must be a string'));
      consoleSpy.mockRestore();
    });

    it('handles readFileSync throwing an error', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation(() => {
        throw new Error('EACCES');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(loadConfig()).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
      consoleSpy.mockRestore();
    });
  });
});
