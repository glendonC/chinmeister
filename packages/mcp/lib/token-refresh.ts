// Shared token refresh logic used by both api.ts (runtime 401 recovery)
// and auth.ts (startup validation). Consolidated to avoid drift.

import { mkdirSync, writeFileSync } from 'fs';
import { createJsonApiClient } from '@chinwag/shared/api-client.js';
import { CONFIG_DIR, CONFIG_FILE } from '@chinwag/shared/config.js';
import { createLogger } from './utils/logger.js';
import { getErrorMessage } from './utils/responses.js';

const log = createLogger('token-refresh');

/** Result of a successful token refresh. */
export interface RefreshResult {
  token: string;
  refresh_token: string;
}

/**
 * Attempt to refresh tokens via POST /auth/refresh and persist to disk.
 *
 * Uses a bare (unauthenticated) client — the refresh endpoint accepts the
 * refresh_token in the body, not via Authorization header.
 *
 * Returns the new token pair on success, or null on failure.
 */
export async function refreshAndPersistToken(
  baseUrl: string,
  refreshToken: string,
  currentConfig: Record<string, unknown>,
): Promise<RefreshResult | null> {
  try {
    const client = createJsonApiClient({ baseUrl, userAgent: 'chinwag-mcp/1.0' });
    const result = await client.post<RefreshResult>('/auth/refresh', {
      refresh_token: refreshToken,
    });

    if (!result.token) return null;

    const updatedConfig = {
      ...currentConfig,
      token: result.token,
      refresh_token: result.refresh_token,
    };
    try {
      mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2) + '\n', { mode: 0o600 });
    } catch (writeErr: unknown) {
      log.warn('Could not persist refreshed token: ' + getErrorMessage(writeErr));
    }

    log.info('Token refreshed successfully.');
    return result;
  } catch (err: unknown) {
    log.error('Token refresh failed: ' + getErrorMessage(err));
    return null;
  }
}
