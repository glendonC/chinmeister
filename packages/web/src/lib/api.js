// chinwag API client
// Pure utility — no store imports to avoid circular deps.

import { createJsonApiClient, DEFAULT_API_URL } from '../../../shared/api-client.js';

export function getApiUrl() {
  return import.meta.env.VITE_CHINWAG_API_URL || DEFAULT_API_URL;
}

/**
 * Make an authenticated API request.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. '/me')
 * @param {object|null} body - JSON body
 * @param {string|null} authToken - Bearer token
 * @returns {Promise<object>} parsed JSON response
 */
export async function api(method, path, body = null, authToken = null) {
  return createJsonApiClient({
    baseUrl: getApiUrl(),
    authToken,
    timeoutMs: 15_000,
    parseErrorMessage: ({ status }) => `HTTP ${status} (server error)`,
    httpErrorMessage: ({ status, data }) => data?.error || `HTTP ${status}`,
    timeoutErrorMessage: () => 'Request timed out',
  }).request(method, path, body);
}
