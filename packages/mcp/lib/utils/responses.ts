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
