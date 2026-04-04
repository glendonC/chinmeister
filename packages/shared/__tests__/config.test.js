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

  describe('saveConfig and deleteConfig', () => {
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

    it('deletes from the active config path', () => {
      vi.stubEnv('CHINWAG_PROFILE', 'local');
      existsSync.mockReturnValue(true);

      deleteConfig();

      expect(unlinkSync).toHaveBeenCalledWith(LOCAL_CONFIG_FILE);
    });
  });
});
