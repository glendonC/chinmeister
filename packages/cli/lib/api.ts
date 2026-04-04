import { createJsonApiClient } from '@chinwag/shared/api-client.js';
import type { JsonApiClient } from '@chinwag/shared/api-client.js';
import type { ChinwagConfig } from '@chinwag/shared/config.js';
import { resolveRuntimeTargets, type RuntimeTargets } from '@chinwag/shared/runtime-profile.js';

// During development, point this at wrangler dev's local URL.
export function getRuntimeTargets(): RuntimeTargets {
  return resolveRuntimeTargets({
    profile: process.env.CHINWAG_PROFILE,
    apiUrl: process.env.CHINWAG_API_URL,
    dashboardUrl: process.env.CHINWAG_DASHBOARD_URL,
    chatWsUrl: process.env.CHINWAG_WS_URL,
  });
}

export function getApiUrl(): string {
  return getRuntimeTargets().apiUrl;
}

export function api(
  config: ChinwagConfig | null,
  { agentId }: { agentId?: string | null } = {},
): JsonApiClient {
  const runtime = getRuntimeTargets();
  return createJsonApiClient({
    baseUrl: runtime.apiUrl,
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
