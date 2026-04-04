import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { formatError } from './error-utils.js';
import { createLogger } from './logger.js';
import {
  LOCAL_RUNTIME_PROFILE,
  resolveRuntimeProfile,
  type ChinwagRuntimeProfile,
  type RuntimeProfileOptions,
} from './runtime-profile.js';

const log = createLogger('config');

export interface ChinwagConfig {
  token?: string;
  refresh_token?: string;
  handle?: string;
  userId?: string;
  color?: string;
  [key: string]: unknown;
}

const OPTIONAL_STRING_FIELDS: ReadonlyArray<keyof ChinwagConfig> = [
  'token',
  'refresh_token',
  'handle',
  'userId',
  'color',
];

/**
 * Structurally validate a parsed value against the ChinwagConfig shape.
 * Returns an error string if invalid, or null if the shape is acceptable.
 */
export function validateConfigShape(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `Expected a JSON object, got ${Array.isArray(value) ? 'array' : typeof value}`;
  }

  const obj = value as Record<string, unknown>;
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (field in obj && obj[field] !== undefined && typeof obj[field] !== 'string') {
      return `Field "${field}" must be a string, got ${typeof obj[field]}`;
    }
  }

  return null;
}

export const CONFIG_DIR = join(homedir(), '.chinwag');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const LOCAL_CONFIG_DIR = join(CONFIG_DIR, 'local');
export const LOCAL_CONFIG_FILE = join(LOCAL_CONFIG_DIR, 'config.json');

export interface ConfigPathOptions extends RuntimeProfileOptions {
  profile?: ChinwagRuntimeProfile | string | null;
}

export interface ConfigPaths {
  profile: ChinwagRuntimeProfile;
  configDir: string;
  configFile: string;
}

function resolveConfigPathOptions(options: ConfigPathOptions = {}): RuntimeProfileOptions {
  return {
    profile: options.profile ?? process.env.CHINWAG_PROFILE,
    apiUrl: options.apiUrl ?? process.env.CHINWAG_API_URL,
    dashboardUrl: options.dashboardUrl ?? process.env.CHINWAG_DASHBOARD_URL,
    chatWsUrl: options.chatWsUrl ?? process.env.CHINWAG_WS_URL,
  };
}

export function getConfigPaths(options: ConfigPathOptions = {}): ConfigPaths {
  const profile = resolveRuntimeProfile(resolveConfigPathOptions(options));
  if (profile === LOCAL_RUNTIME_PROFILE) {
    return {
      profile,
      configDir: LOCAL_CONFIG_DIR,
      configFile: LOCAL_CONFIG_FILE,
    };
  }
  return {
    profile,
    configDir: CONFIG_DIR,
    configFile: CONFIG_FILE,
  };
}

export function configExists(options: ConfigPathOptions = {}): boolean {
  return existsSync(getConfigPaths(options).configFile);
}

export function loadConfig(options: ConfigPathOptions = {}): ChinwagConfig | null {
  const { configFile } = getConfigPaths(options);
  if (!existsSync(configFile)) return null;
  let raw: string;
  try {
    raw = readFileSync(configFile, 'utf-8');
  } catch (err: unknown) {
    log.error(`Failed to read config file ${configFile}: ${formatError(err)}`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const preview = raw.length > 120 ? raw.slice(0, 120) + '...' : raw;
    log.error(
      `Config file ${configFile} contains invalid JSON: ${formatError(err)}` +
        `\n  Content preview: ${JSON.stringify(preview)}`,
    );
    return null;
  }

  const validationError = validateConfigShape(parsed);
  if (validationError) {
    log.error(`Config file ${configFile} has invalid shape: ${validationError}`);
    return null;
  }

  return parsed as ChinwagConfig;
}

export function saveConfig(config: ChinwagConfig, options: ConfigPathOptions = {}): void {
  const { configDir, configFile } = getConfigPaths(options);
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function deleteConfig(options: ConfigPathOptions = {}): void {
  const { configFile } = getConfigPaths(options);
  if (existsSync(configFile)) {
    unlinkSync(configFile);
  }
}
