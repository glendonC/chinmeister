// Token validation, refresh, and profile registration for the MCP server.
// CRITICAL: Never console.log — stdio transport. Use console.error.

import { mkdirSync, writeFileSync } from 'fs';
import { CONFIG_DIR, CONFIG_FILE } from '@chinwag/shared/config.js';
import { createLogger } from './utils/logger.js';
import { getErrorMessage } from './utils/responses.js';
import type { EnvironmentProfile } from './profile.js';

const log = createLogger('auth');

/** Config shape as used by the auth module (superset of ChinwagConfig). */
interface AuthConfig {
  token?: string;
  refresh_token?: string;
  handle?: string;
  userId?: string;
  color?: string;
  [key: string]: unknown;
}

/** API client subset needed by validateConfig. */
interface AuthApiClient {
  get(path: string): Promise<unknown>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put(path: string, body?: unknown): Promise<unknown>;
}

/** Error with an optional HTTP status code. */
interface HttpError extends Error {
  status?: number;
}

/** Dependencies injected into validateConfig. */
interface ValidateConfigDeps {
  configExists: () => boolean;
  loadConfig: () => AuthConfig | null;
  api: (config: AuthConfig | null, options?: Record<string, unknown>) => AuthApiClient;
}

/** Result of a successful token refresh. */
interface RefreshResult {
  token: string;
  refresh_token: string;
}

/**
 * Validate that a chinwag config exists and has a valid token.
 * If the access token is expired, attempts a transparent refresh using the
 * refresh token (180-day TTL vs 90-day access token).
 * Exits the process with an error message if validation fails.
 */
export async function validateConfig({
  configExists,
  loadConfig,
  api,
}: ValidateConfigDeps): Promise<{ config: AuthConfig }> {
  if (!configExists()) {
    log.error('No config found. Run `npx chinwag` first to create an account.');
    process.exit(1);
  }

  let config = loadConfig() as AuthConfig;
  if (!config?.token) {
    log.error('Invalid config — missing token. Run `npx chinwag` to re-initialize.');
    process.exit(1);
  }

  // Verify token is still valid; if expired, attempt transparent refresh.
  const preflightClient = api(config);
  try {
    await preflightClient.get('/me');
  } catch (err: unknown) {
    const httpErr = err as HttpError;
    if (httpErr.status === 401 && config.refresh_token) {
      log.info('Access token expired, attempting refresh...');
      try {
        const refreshResult = await preflightClient.post<RefreshResult>('/auth/refresh', {
          refresh_token: config.refresh_token,
        });
        config = {
          ...config,
          token: refreshResult.token,
          refresh_token: refreshResult.refresh_token,
        };
        try {
          mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
          writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
        } catch (writeErr: unknown) {
          log.warn('Could not persist refreshed token: ' + getErrorMessage(writeErr));
        }
        log.info('Token refreshed successfully.');
      } catch (refreshErr: unknown) {
        log.error('Token refresh failed: ' + getErrorMessage(refreshErr));
        log.error('Run `npx chinwag init` to re-authenticate.');
        process.exit(1);
      }
    } else if (httpErr.status === 401) {
      log.error('Access token expired and no refresh token available.');
      log.error('Run `npx chinwag init` to re-authenticate.');
      process.exit(1);
    }
    // Non-401 errors: proceed anyway — might be temporary network issue
  }

  return { config };
}

/**
 * Register the agent's environment profile with the backend.
 * Logs the result but never blocks startup on failure.
 */
export async function registerProfile(
  client: AuthApiClient,
  profile: EnvironmentProfile,
): Promise<void> {
  try {
    await client.put('/agent/profile', profile);
    const stack = [...profile.languages, ...profile.frameworks].join(', ') || 'no stack detected';
    log.info(`Profile registered: ${stack}`);
  } catch (err: unknown) {
    log.error('Failed to register profile: ' + getErrorMessage(err));
  }
}
