import type { RuntimeIdentity } from './agent-identity.js';

export interface ApiClientConfig {
  baseUrl?: string;
  authToken?: string | null;
  agentId?: string | null;
  runtimeIdentity?: RuntimeIdentity | null;
  userAgent?: string | null;
  timeoutMs?: number;
  maxRetryAttempts?: number;
  maxTimeoutRetryAttempts?: number;
  retryDelayMs?: number;
  timeoutRetryDelayMs?: number;
  retryableCodes?: string[];
  parseErrorMessage?: (ctx: { method: string; path: string; status: number }) => string;
  httpErrorMessage?: (ctx: {
    method: string;
    path: string;
    status: number;
    data: unknown;
  }) => string;
  timeoutErrorMessage?: (ctx: { method: string; path: string }) => string;
}

export interface JsonApiClient {
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  del<T = unknown>(path: string, body?: unknown): Promise<T>;
}

interface ApiError extends Error {
  status?: number;
  data?: unknown;
  code?: string;
}

export const DEFAULT_API_URL = 'https://chinwag-api.glendonchin.workers.dev';

const DEFAULT_RETRYABLE_CODES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createJsonApiClient({
  baseUrl = DEFAULT_API_URL,
  authToken = null,
  agentId = null,
  runtimeIdentity = null,
  userAgent = null,
  timeoutMs = 10_000,
  maxRetryAttempts = 0,
  maxTimeoutRetryAttempts = 0,
  retryDelayMs = 200,
  timeoutRetryDelayMs = 1_000,
  retryableCodes = DEFAULT_RETRYABLE_CODES,
  parseErrorMessage = ({ status }) => `HTTP ${status} (non-JSON response)`,
  httpErrorMessage = ({ method, path, status, data }) =>
    typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `${method} ${path} → HTTP ${status}`,
  timeoutErrorMessage = ({ method, path }) => `Request timed out: ${method} ${path}`,
}: ApiClientConfig = {}): JsonApiClient {
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) defaultHeaders.Authorization = `Bearer ${authToken}`;
  if (userAgent) defaultHeaders['User-Agent'] = userAgent;
  if (agentId) defaultHeaders['X-Agent-Id'] = agentId;
  if (runtimeIdentity?.hostTool) defaultHeaders['X-Agent-Host-Tool'] = runtimeIdentity.hostTool;
  if (runtimeIdentity?.agentSurface)
    defaultHeaders['X-Agent-Surface'] = runtimeIdentity.agentSurface;
  if (runtimeIdentity?.transport) defaultHeaders['X-Agent-Transport'] = runtimeIdentity.transport;
  if (runtimeIdentity?.tier) defaultHeaders['X-Agent-Tier'] = runtimeIdentity.tier;

  async function request<T = unknown>(
    method: string,
    path: string,
    body: unknown = null,
    attempt = 0,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const opts: RequestInit = {
        method,
        headers: { ...defaultHeaders },
        signal: controller.signal,
      };

      if (body !== null) {
        opts.body = JSON.stringify(body);
      }

      const res = await fetch(`${baseUrl}${path}`, opts);

      if ((res.status >= 500 || res.status === 429) && attempt < maxRetryAttempts) {
        clearTimeout(timeout);
        const backoff =
          res.status === 429
            ? Math.max(1000, parseInt(res.headers.get('retry-after') || '1', 10) * 1000)
            : retryDelayMs * Math.pow(2, attempt);
        await sleep(backoff);
        return request<T>(method, path, body, attempt + 1);
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        const parseErr = new Error(
          parseErrorMessage({ method, path, status: res.status }),
        ) as ApiError;
        parseErr.status = res.status;
        throw parseErr;
      }

      if (!res.ok) {
        const err = new Error(
          httpErrorMessage({ method, path, status: res.status, data }),
        ) as ApiError;
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data as T;
    } catch (error: unknown) {
      const err: ApiError =
        error instanceof Error
          ? (error as ApiError)
          : (Object.assign(new Error(String(error)), {
              status: undefined,
              code: undefined,
            }) as ApiError);
      if (err.name === 'AbortError') {
        if (attempt < maxTimeoutRetryAttempts) {
          await sleep(timeoutRetryDelayMs);
          return request<T>(method, path, body, attempt + 1);
        }
        const timeoutErr = new Error(timeoutErrorMessage({ method, path })) as ApiError;
        timeoutErr.status = 408;
        throw timeoutErr;
      }

      if (err.code && retryableCodes.includes(err.code) && attempt < maxRetryAttempts) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        return request<T>(method, path, body, attempt + 1);
      }

      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    request,
    get: <T = unknown>(path: string) => request<T>('GET', path),
    post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body),
    del: <T = unknown>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  };
}
