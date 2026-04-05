import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import {
  CONFIG_DIR,
  CONFIG_FILE,
  LOCAL_CONFIG_DIR,
  LOCAL_CONFIG_FILE,
  validateConfigShape,
  getConfigPaths,
  configExists,
  loadConfig,
  saveConfig,
  deleteConfig,
} from '../config.js';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

describe('config', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('validateConfigShape', () => {
    it('returns null for valid config with all string fields', () => {
      expect(
        validateConfigShape({
          token: 'tok_abc',
          refresh_token: 'ref_123',
          handle: 'alice',
          userId: 'user_1',
          color: 'cyan',
        }),
      ).toBeNull();
    });

    it('returns null for an empty object (all fields optional)', () => {
      expect(validateConfigShape({})).toBeNull();
    });

    it('returns null for config with extra unknown fields', () => {
      expect(validateConfigShape({ token: 'tok', customField: 42 })).toBeNull();
    });

    it('returns error when a known field has a number value', () => {
      const result = validateConfigShape({ token: 123 });
      expect(result).toContain('"token" must be a string');
      expect(result).toContain('got number');
    });

    it('returns error for each invalid known field', () => {
      expect(validateConfigShape({ handle: true })).toContain('"handle" must be a string');
      expect(validateConfigShape({ color: [] })).toContain('"color" must be a string');
      expect(validateConfigShape({ refresh_token: 42 })).toContain(
        '"refresh_token" must be a string',
      );
    });

    it('returns error for an array', () => {
      const result = validateConfigShape([1, 2, 3]);
      expect(result).toContain('array');
    });

    it('returns error for null', () => {
      const result = validateConfigShape(null);
      expect(result).toContain('object');
    });

    it('returns error for a string', () => {
      const result = validateConfigShape('not an object');
      expect(result).toContain('string');
    });

    it('returns error for a number', () => {
      const result = validateConfigShape(42);
      expect(result).toContain('number');
    });

    it('returns error for undefined (non-object)', () => {
      const result = validateConfigShape(undefined);
      expect(result).toContain('undefined');
    });
  });

  describe('CONFIG_DIR and CONFIG_FILE', () => {
    it('CONFIG_DIR points to ~/.chinwag', () => {
      expect(CONFIG_DIR).toBe('/home/testuser/.chinwag');
    });

    it('CONFIG_FILE points to ~/.chinwag/config.json', () => {
      expect(CONFIG_FILE).toBe('/home/testuser/.chinwag/config.json');
    });

    it('LOCAL_CONFIG_FILE points to ~/.chinwag/local/config.json', () => {
      expect(LOCAL_CONFIG_DIR).toBe('/home/testuser/.chinwag/local');
      expect(LOCAL_CONFIG_FILE).toBe('/home/testuser/.chinwag/local/config.json');
    });
  });

  describe('getConfigPaths', () => {
    it('defaults to the production config path', () => {
      expect(getConfigPaths()).toEqual({
        profile: 'prod',
        configDir: CONFIG_DIR,
        configFile: CONFIG_FILE,
      });
    });

    it('uses the local config path when CHINWAG_PROFILE=local', () => {
      vi.stubEnv('CHINWAG_PROFILE', 'local');

      expect(getConfigPaths()).toEqual({
        profile: 'local',
        configDir: LOCAL_CONFIG_DIR,
        configFile: LOCAL_CONFIG_FILE,
      });
    });

    it('infers the local config path from a loopback API override', () => {
      vi.stubEnv('CHINWAG_API_URL', 'http://localhost:8787');

      expect(getConfigPaths()).toEqual({
        profile: 'local',
        configDir: LOCAL_CONFIG_DIR,
        configFile: LOCAL_CONFIG_FILE,
      });
    });

    it('allows callers to override the profile explicitly', () => {
      expect(getConfigPaths({ profile: 'local' }).configFile).toBe(LOCAL_CONFIG_FILE);
      expect(getConfigPaths({ profile: 'prod' }).configFile).toBe(CONFIG_FILE);
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
          refresh_token: 'refresh-test-token',
          handle: 'alice',
        }),
      );
      const config = loadConfig();
      expect(config).toEqual({
        token: 'test-token',
        refresh_token: 'refresh-test-token',
        handle: 'alice',
      });
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

  describe('saveConfig', () => {
    it('writes to the local config path when the local profile is active', () => {
      vi.stubEnv('CHINWAG_PROFILE', 'local');

      saveConfig({ token: 'tok_local' });

      expect(mkdirSync).toHaveBeenCalledWith(LOCAL_CONFIG_DIR, { recursive: true, mode: 0o700 });
      expect(writeFileSync).toHaveBeenCalledWith(
        LOCAL_CONFIG_FILE,
        expect.stringContaining('"token": "tok_local"'),
        { mode: 0o600 },
      );
    });

    it('writes to the default config path in production profile', () => {
      saveConfig({ token: 'tok_prod', handle: 'alice' });

      expect(mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true, mode: 0o700 });
      expect(writeFileSync).toHaveBeenCalledWith(
        CONFIG_FILE,
        expect.stringContaining('"token": "tok_prod"'),
        { mode: 0o600 },
      );
    });

    it('creates directory with 0o700 permissions', () => {
      saveConfig({ token: 'tok' });
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ mode: 0o700 }),
      );
    });

    it('writes file with 0o600 permissions', () => {
      saveConfig({ token: 'tok' });
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ mode: 0o600 }),
      );
    });

    it('includes trailing newline in written content', () => {
      saveConfig({ handle: 'bob' });
      const writtenContent = writeFileSync.mock.calls[0][1];
      expect(writtenContent).toMatch(/\n$/);
    });
  });

  describe('deleteConfig', () => {
    it('deletes from the active config path', () => {
      vi.stubEnv('CHINWAG_PROFILE', 'local');
      existsSync.mockReturnValue(true);

      deleteConfig();

      expect(unlinkSync).toHaveBeenCalledWith(LOCAL_CONFIG_FILE);
    });

    it('does nothing when config file does not exist (handles gracefully)', () => {
      existsSync.mockReturnValue(false);

      deleteConfig();

      expect(unlinkSync).not.toHaveBeenCalled();
    });

    it('deletes the default config file in production profile', () => {
      existsSync.mockReturnValue(true);

      deleteConfig();

      expect(unlinkSync).toHaveBeenCalledWith(CONFIG_FILE);
    });
  });
});
