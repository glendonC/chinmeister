import { createJsonApiClient, DEFAULT_API_URL } from '@chinwag/shared/api-client.js';
import type { JsonApiClient } from '@chinwag/shared/api-client.js';
import type { ChinwagConfig } from '@chinwag/shared/config.js';

// During development, point this at wrangler dev's local URL.
export function getApiUrl(): string {
  return process.env.CHINWAG_API_URL || DEFAULT_API_URL;
}

export function api(
  config: ChinwagConfig | null,
  { agentId }: { agentId?: string | null } = {},
): JsonApiClient {
  return createJsonApiClient({
    baseUrl: getApiUrl(),
    authToken: config?.token || null,
    agentId: agentId || null,
    timeoutMs: 10_000,
    maxRetryAttempts: 2,
    maxTimeoutRetryAttempts: 1,
    httpErrorMessage: ({ method, path, status, data }) =>
      ((data as Record<string, unknown>)?.error as string) || `${method} ${path} → HTTP ${status}`,
    timeoutErrorMessage: ({ method, path }) => `Request timed out: ${method} ${path}`,
  });
}

export async function initAccount(): Promise<unknown> {
  const client = api(null);
  return client.post('/auth/init', {});
}
