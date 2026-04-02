// chinwag API client
// Pure utility — no store imports to avoid circular deps.

import { createJsonApiClient, DEFAULT_API_URL } from '@chinwag/shared/api-client.js';

export function getApiUrl() {
  return import.meta.env.VITE_CHINWAG_API_URL || DEFAULT_API_URL;
}

/**
 * Make an authenticated API request.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. '/me')
 * @param {object|null} body - JSON body
 * @param {string|null} authToken - Bearer token
 * @param {{ signal?: AbortSignal }} [options] - Optional fetch options
 * @returns {Promise<object>} parsed JSON response
 */
export async function api(method, path, body = null, authToken = null, options = {}) {
  return createJsonApiClient({
    baseUrl: getApiUrl(),
    authToken,
    timeoutMs: 15_000,
    signal: options.signal,
    parseErrorMessage: ({ status }) => `HTTP ${status} (server error)`,
    httpErrorMessage: ({ status, data }) => data?.error || `HTTP ${status}`,
    timeoutErrorMessage: () => 'Request timed out',
  }).request(method, path, body);
}
