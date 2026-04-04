import { createJsonApiClient, DEFAULT_API_URL } from '@chinwag/shared/api-client.js';
import type { RuntimeIdentity } from '@chinwag/shared/agent-identity.js';
import {
  API_TIMEOUT_MS,
  API_MAX_RETRY_ATTEMPTS,
  API_MAX_TIMEOUT_RETRY_ATTEMPTS,
} from './constants.js';
import type { ApiClient } from './team.js';

interface ApiOptions {
  agentId?: string;
  runtimeIdentity?: RuntimeIdentity;
}

export function getApiUrl(): string {
  return process.env.CHINWAG_API_URL || DEFAULT_API_URL;
}

export function api(config: { token?: string | null } | null, options: ApiOptions = {}): ApiClient {
  const { agentId, runtimeIdentity } = options;
  return createJsonApiClient({
    baseUrl: getApiUrl(),
    authToken: config?.token || null,
    agentId,
    runtimeIdentity,
    userAgent: 'chinwag-mcp/1.0',
    timeoutMs: API_TIMEOUT_MS,
    maxRetryAttempts: API_MAX_RETRY_ATTEMPTS,
    maxTimeoutRetryAttempts: API_MAX_TIMEOUT_RETRY_ATTEMPTS,
    httpErrorMessage: ({ status, data }: { status: number; data: any }) =>
      data?.error || `HTTP ${status}`,
    timeoutErrorMessage: ({ method, path }: { method: string; path: string }) =>
      `Request timed out: ${method} ${path}`,
  });
}
