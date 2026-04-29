// Shared types for user analytics merge modules.
//
// Each module owns a single analytic. It exposes an accumulator, a `merge`
// that folds one team result into the accumulator, and a `project` that
// shapes the final slice. TeamResult is typed against the shared contract
// so modules get real typing - no Record<string, unknown> smuggling.

import type { UserAnalytics } from '@chinmeister/shared/contracts/analytics.js';

/**
 * Result from a single team's getAnalyticsForOwner call. Either an error
 * shape (timeout / failure) or a partial UserAnalytics - partial because
 * individual DO methods may omit fields on failure.
 *
 * `error` is a structural category, not a free-form message:
 *   'timeout':        DO call exceeded DO_CALL_TIMEOUT_MS
 *   'rpc_error':      DO returned `{ error: ... }` (expected failure)
 *   'unhandled':      unexpected throw bubbled up from rpc()
 *   'shape_mismatch': DO returned data the schema rejected
 *
 * `error_detail` carries the underlying message when useful for server-
 * side debugging. Routes do not surface error_detail to clients verbatim;
 * the label drives a count, the detail drives logs.
 */
export type TeamResult = Partial<UserAnalytics> & { error?: string; error_detail?: string };
