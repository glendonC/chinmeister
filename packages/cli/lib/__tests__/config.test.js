import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// We need to test saveConfig and deleteConfig without touching the real config
// Since config.js imports CONFIG_DIR from shared/config.js, we mock it
vi.mock('../../shared/config.js', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chinwag-config-test-'));
  const CONFIG_DIR = join(tmpDir, '.chinwag');
  const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
  return {
    CONFIG_DIR,
    CONFIG_FILE,
    configExists: () => existsSync(CONFIG_FILE),
    loadConfig: () => {
      try {
        return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {
        return null;
      }
    },
  };
});

import {
  saveConfig,
  deleteConfig,
  configExists,
  loadConfig,
  CONFIG_DIR,
  CONFIG_FILE,
} from '../config.js';

afterEach(() => {
  // Clean up
  try {
    rmSync(CONFIG_DIR, { recursive: true, force: true });
  } catch {
    /* cleanup best-effort */
  }
});

describe('saveConfig', () => {
  it('creates config directory and writes config file', () => {
    saveConfig({ token: 'tok_test', handle: 'test_user' });

    expect(existsSync(CONFIG_FILE)).toBe(true);
    const content = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    expect(content).toEqual({ token: 'tok_test', handle: 'test_user' });
  });

  it('overwrites existing config', () => {
    saveConfig({ token: 'old' });
    saveConfig({ token: 'new', handle: 'updated' });

    const content = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    expect(content.token).toBe('new');
    expect(content.handle).toBe('updated');
  });
});

describe('deleteConfig', () => {
  it('deletes existing config file', () => {
    saveConfig({ token: 'tok_test' });
    expect(existsSync(CONFIG_FILE)).toBe(true);

    deleteConfig();
    expect(existsSync(CONFIG_FILE)).toBe(false);
  });

  it('does nothing when config does not exist', () => {
    // Should not throw
    deleteConfig();
  });
});

describe('configExists', () => {
  it('returns false when no config file exists', () => {
    expect(configExists()).toBe(false);
  });

  it('returns true after saving config', () => {
    saveConfig({ token: 'tok_test' });
    expect(configExists()).toBe(true);
  });
});

describe('loadConfig', () => {
  it('returns null when config does not exist', () => {
    expect(loadConfig()).toBeNull();
  });

  it('returns parsed config after save', () => {
    saveConfig({ token: 'tok_test', handle: 'myuser' });
    const config = loadConfig();
    expect(config).toEqual({ token: 'tok_test', handle: 'myuser' });
  });
});
