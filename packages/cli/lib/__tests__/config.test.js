import { afterEach, describe, expect, it, vi } from 'vitest';

const { sharedConfigMock } = vi.hoisted(() => ({
  sharedConfigMock: {
    CONFIG_DIR: '/home/testuser/.chinwag',
    CONFIG_FILE: '/home/testuser/.chinwag/config.json',
    LOCAL_CONFIG_DIR: '/home/testuser/.chinwag/local',
    LOCAL_CONFIG_FILE: '/home/testuser/.chinwag/local/config.json',
    getConfigPaths: vi.fn(() => ({
      profile: 'prod',
      configDir: '/home/testuser/.chinwag',
      configFile: '/home/testuser/.chinwag/config.json',
    })),
    configExists: vi.fn(() => true),
    loadConfig: vi.fn(() => ({ token: 'tok_test' })),
    saveConfig: vi.fn(),
    deleteConfig: vi.fn(),
  },
}));

vi.mock('@chinwag/shared/config.js', () => sharedConfigMock);

import * as cliConfig from '../config.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('cli config module', () => {
  it('re-exports shared config helpers and paths', () => {
    expect(cliConfig.CONFIG_DIR).toBe(sharedConfigMock.CONFIG_DIR);
    expect(cliConfig.CONFIG_FILE).toBe(sharedConfigMock.CONFIG_FILE);
    expect(cliConfig.LOCAL_CONFIG_DIR).toBe(sharedConfigMock.LOCAL_CONFIG_DIR);
    expect(cliConfig.LOCAL_CONFIG_FILE).toBe(sharedConfigMock.LOCAL_CONFIG_FILE);
    expect(cliConfig.getConfigPaths).toBe(sharedConfigMock.getConfigPaths);
    expect(cliConfig.configExists).toBe(sharedConfigMock.configExists);
    expect(cliConfig.loadConfig).toBe(sharedConfigMock.loadConfig);
    expect(cliConfig.saveConfig).toBe(sharedConfigMock.saveConfig);
    expect(cliConfig.deleteConfig).toBe(sharedConfigMock.deleteConfig);
  });
});
