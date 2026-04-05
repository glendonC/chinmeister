// Tool handler middleware — guards, preamble injection, error handling.
// Extracted from index.ts to avoid circular imports when tool files import withTeam.

import { teamPreamble } from '../context.js';
import { noTeam, errorResult, appendDegradedWarning } from '../utils/responses.js';
import type { McpToolResult } from '../utils/responses.js';
import type { ToolDeps } from './types.js';

/**
 * Middleware that guards a tool handler with team membership check,
 * optional preamble injection, and error handling.
 *
 * Provides to the handler callback:
 * - `preamble`: team context string (empty when `skipPreamble` is set)
 *
 * Automatically applied by this middleware (handlers must NOT duplicate):
 * - `noTeam()` guard when no team is joined
 * - `try/catch` -> `errorResult()` for uncaught exceptions
 * - `appendDegradedWarning()` when heartbeat is dead
 */
export function withTeam(
  { state, team }: Pick<ToolDeps, 'state' | 'team'>,
  handler: (args: Record<string, unknown>, ctx: { preamble: string }) => Promise<McpToolResult>,
  options: { skipPreamble?: boolean } = {},
): (args: Record<string, unknown>) => Promise<McpToolResult> {
  return async (args: Record<string, unknown>) => {
    if (!state.teamId) {
      return noTeam(state);
    }
    try {
      const preamble = options.skipPreamble ? '' : await teamPreamble(team, state.teamId);
      const result = await handler(args, { preamble });
      return appendDegradedWarning(result, state.heartbeatDead);
    } catch (err: unknown) {
      return errorResult(err);
    }
  };
}
