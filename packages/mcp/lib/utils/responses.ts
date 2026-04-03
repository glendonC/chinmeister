// Standard MCP tool response builders and error extraction helpers.
// Centralizes the response shape so tool handlers stay focused on logic.

export interface McpToolContent {
  type: 'text';
  text: string;
}

export interface McpToolResult {
  content: McpToolContent[];
  isError?: boolean;
}

interface HttpError extends Error {
  status?: number;
}

/** Extract HTTP status from an unknown error (e.g. from fetch). */
export function getHttpStatus(err: unknown): number | undefined {
  return err instanceof Error && 'status' in err ? (err as HttpError).status : undefined;
}

/** Extract a message string from an unknown error. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Error response for tools that require team membership.
 */
export function noTeam(): McpToolResult {
  return {
    content: [{ type: 'text', text: 'Not in a team. Join one first with chinwag_join_team.' }],
    isError: true,
  };
}

/**
 * Error response from a caught exception.
 * Returns a user-friendly message for 401 auth errors.
 * Accepts unknown to support `catch (err: unknown)` in callers.
 */
export function errorResult(err: unknown): McpToolResult {
  const status = getHttpStatus(err);
  const message = getErrorMessage(err);
  const msg =
    status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : message;
  return { content: [{ type: 'text', text: msg }], isError: true };
}

/**
 * Success text content response.
 */
export function textResult(text: string): McpToolResult {
  return { content: [{ type: 'text', text }] };
}

// --- API response validation helpers ---
// Lightweight type guards for degrading gracefully on malformed API responses.
// Avoids adding Zod to the MCP package while preventing unhandled TypeErrors
// when the API returns unexpected shapes.

/** Safely check that a value is a non-null object. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Safely extract an array field from an API response, defaulting to empty. */
export function safeArray<T = unknown>(obj: unknown, key: string): T[] {
  if (!isObject(obj)) return [];
  const val = (obj as Record<string, unknown>)[key];
  return Array.isArray(val) ? (val as T[]) : [];
}

/** Safely extract a string field from an API response. */
export function safeString(obj: unknown, key: string, fallback = ''): string {
  if (!isObject(obj)) return fallback;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === 'string' ? val : fallback;
}
