import { createJsonApiClient } from '@chinmeister/shared/api-client.js';
import type { JsonApiClient } from '@chinmeister/shared/api-client.js';
import type { ChinmeisterConfig } from '@chinmeister/shared/config.js';
import { saveConfig } from '@chinmeister/shared/config.js';
import { resolveRuntimeTargets, type RuntimeTargets } from '@chinmeister/shared/runtime-profile.js';

// During development, point this at wrangler dev's local URL.
export function getRuntimeTargets(): RuntimeTargets {
  return resolveRuntimeTargets({
    profile: process.env.CHINMEISTER_PROFILE,
    apiUrl: process.env.CHINMEISTER_API_URL,
    dashboardUrl: process.env.CHINMEISTER_DASHBOARD_URL,
  });
}

export function getApiUrl(): string {
  return getRuntimeTargets().apiUrl;
}

interface HttpError extends Error {
  status?: number;
}

interface RefreshResult {
  token: string;
  refresh_token: string;
}

const REAUTH_HINT = 'Run `chinmeister token` to re-authenticate.';

/**
 * Attempt one token refresh using the stored refresh_token. Returns the new
 * access token on success, persists the new pair to the user's config, or
 * returns null on any failure.
 */
async function tryRefreshToken(baseUrl: string, config: ChinmeisterConfig): Promise<string | null> {
  if (!config.refresh_token) return null;
  try {
    const bare = createJsonApiClient({ baseUrl, timeoutMs: 10_000 });
    const result = await bare.post<RefreshResult>('/auth/refresh', {
      refresh_token: config.refresh_token,
    });
    if (!result?.token) return null;
    config.token = result.token;
    config.refresh_token = result.refresh_token;
    try {
      saveConfig(config);
    } catch {
      // In-memory token still works for the current process even if persist fails.
    }
    return result.token;
  } catch {
    return null;
  }
}

export function api(
  config: ChinmeisterConfig | null,
  { agentId }: { agentId?: string | null } = {},
): JsonApiClient {
  const runtime = getRuntimeTargets();
  const baseUrl = runtime.apiUrl;
  let currentToken = config?.token || null;

  // Inflight deduplication: concurrent 401s share a single refresh attempt.
  let inflightRefresh: Promise<string | null> | null = null;

  function buildClient(token: string | null): JsonApiClient {
    return createJsonApiClient({
      baseUrl,
      authToken: token,
      agentId: agentId || null,
      timeoutMs: 10_000,
      maxRetryAttempts: 2,
      maxTimeoutRetryAttempts: 1,
      httpErrorMessage: ({ method, path, status, data }) =>
        ((data as Record<string, unknown>)?.error as string) ||
        `${method} ${path} → HTTP ${status}`,
      timeoutErrorMessage: ({ method, path }) => `Request timed out: ${method} ${path}`,
    });
  }

  let inner = buildClient(currentToken);

  async function withRefresh<T>(fn: (client: JsonApiClient) => Promise<T>): Promise<T> {
    try {
      return await fn(inner);
    } catch (err: unknown) {
      const httpErr = err as HttpError;
      if (httpErr.status !== 401 || !config) throw err;

      if (!inflightRefresh) {
        inflightRefresh = tryRefreshToken(baseUrl, config).finally(() => {
          inflightRefresh = null;
        });
      }
      const newToken = await inflightRefresh;
      if (!newToken) {
        const wrapped: HttpError = new Error(`Session expired. ${REAUTH_HINT}`) as HttpError;
        wrapped.status = 401;
        throw wrapped;
      }

      currentToken = newToken;
      inner = buildClient(currentToken);
      try {
        return await fn(inner);
      } catch (retryErr: unknown) {
        const retryHttp = retryErr as HttpError;
        if (retryHttp.status === 401) {
          const wrapped: HttpError = new Error(`Session expired. ${REAUTH_HINT}`) as HttpError;
          wrapped.status = 401;
          throw wrapped;
        }
        throw retryErr;
      }
    }
  }

  return {
    request: <T = unknown>(method: string, path: string, body?: unknown) =>
      withRefresh<T>((c) => c.request<T>(method, path, body)),
    get: <T = unknown>(path: string) => withRefresh<T>((c) => c.get<T>(path)),
    post: <T = unknown>(path: string, body?: unknown) =>
      withRefresh<T>((c) => c.post<T>(path, body)),
    put: <T = unknown>(path: string, body?: unknown) => withRefresh<T>((c) => c.put<T>(path, body)),
    del: <T = unknown>(path: string, body?: unknown) => withRefresh<T>((c) => c.del<T>(path, body)),
  };
}

export async function initAccount(): Promise<unknown> {
  const client = api(null);
  return client.post('/auth/init', {});
}
