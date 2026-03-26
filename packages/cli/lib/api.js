import { createJsonApiClient, DEFAULT_API_URL } from '../../shared/api-client.js';

// During development, point this at wrangler dev's local URL.
export function getApiUrl() {
  return process.env.CHINWAG_API_URL || DEFAULT_API_URL;
}

export function api(config) {
  return createJsonApiClient({
    baseUrl: getApiUrl(),
    authToken: config?.token || null,
    timeoutMs: 10_000,
    maxRetryAttempts: 2,
    maxTimeoutRetryAttempts: 1,
    httpErrorMessage: ({ method, path, status, data }) => data?.error || `${method} ${path} → HTTP ${status}`,
    timeoutErrorMessage: ({ method, path }) => `Request timed out: ${method} ${path}`,
  });
}

export async function initAccount() {
  const client = api(null);
  return client.post('/auth/init', {});
}
