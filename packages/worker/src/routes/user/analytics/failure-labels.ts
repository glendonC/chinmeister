// Per-team failure classification.
//
// The analytics fan-out catches every per-team failure and tags it with a
// structural label so the response's `failure_labels` map carries an honest
// attribution rather than collapsing every cause into a single opaque
// `degraded: true`. Labels are kept small and stable; the underlying
// message lives in `error_detail` for server-side logs and never reaches
// clients verbatim.

import { getErrorMessage } from '../../../lib/errors.js';
import type { TeamResult } from './types.js';

/**
 * Classify a thrown error from the team analytics fetch. Returns a
 * TeamResult error envelope with the structural label and the underlying
 * message for diagnostics.
 *
 * Labels:
 *   'timeout'   - the withTimeout wrapper rejected because the DO call
 *                 exceeded DO_CALL_TIMEOUT_MS, or the runtime aborted
 *                 with AbortError (network reset, request cancelled).
 *   'unhandled' - any other unexpected throw. Catch-all so the route's
 *                 promise never rejects upstream of the fan-out merger.
 */
export function classifyTeamThrow(err: unknown): TeamResult {
  const msg = getErrorMessage(err);
  const isTimeout =
    msg === 'DO call timed out' || (err instanceof Error && err.name === 'AbortError');
  const label = isTimeout ? 'timeout' : 'unhandled';
  return { error: label, error_detail: msg } satisfies TeamResult;
}

/**
 * Cheap structural sanity check on a per-team payload before it is fed
 * into the merge accumulators. The accumulators assume each field is
 * either absent or the expected shape; a primitive or null here would
 * crash merge with an opaque 'unhandled' label upstream and bury the
 * real cause. Returning false here lets the route emit 'shape_mismatch'
 * and short-circuit the team result.
 *
 * Validates only the structural envelope (an object with at least an
 * array-shaped daily_trends or no daily_trends at all). Field-by-field
 * zod parsing is intentionally not done here because every team in
 * every fan-out request would pay the cost; the typed return on
 * getExtendedAnalytics already prevents drift at compile time.
 */
export function isTeamPayloadShapeOk(value: unknown): value is TeamResult {
  if (value === null || typeof value !== 'object') return false;
  const dt = (value as { daily_trends?: unknown }).daily_trends;
  if (dt !== undefined && !Array.isArray(dt)) return false;
  return true;
}
