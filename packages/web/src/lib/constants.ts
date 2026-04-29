/** Polling & WebSocket timing constants (milliseconds). */

/** Default interval between HTTP poll cycles. */
export const POLL_MS = 5_000;

/** Slow-mode poll interval after repeated failures. */
export const SLOW_POLL_MS = 30_000;

/** Initial delay before the first WebSocket reconciliation poll. */
export const RECONCILE_INITIAL_MS = 30_000;

/** Maximum reconciliation poll interval (5 minutes). */
export const RECONCILE_MAX_MS = 300_000;

/**
 * WebSocket close code sent by the worker when a member's access has been
 * revoked (explicit leave, future kick). Range 4000-4999 is reserved for
 * app-private codes per RFC 6455. Matches MEMBERSHIP_REVOKED_CLOSE_CODE in
 * packages/worker/src/dos/team/presence.ts; both sides must agree.
 */
export const MEMBERSHIP_REVOKED_CLOSE_CODE = 4001;

// --- Display limits ---

/** Max recent sessions shown in the project view sidebar. */
export const MAX_DISPLAY_SESSIONS = 8;

/** Max recent sessions retained for project-level analytics. */
export const MAX_RECENT_SESSIONS = 24;
