// Shared constants for the chinwag MCP server.
// All magic numbers live here — import by name, never hardcode.
//
// Mirrors the worker's constants.js pattern: grouped by domain,
// every value named and documented.

// --- Context cache ---
/** TTL for cached team context before re-fetching */
export const CONTEXT_TTL_MS = 30_000;

// --- WebSocket connection ---
/** Ping interval to keep DB heartbeat fresh */
export const WS_PING_MS = 60_000;
/** Initial delay before first reconnect attempt */
export const INITIAL_RECONNECT_DELAY_MS = 1_000;
/** Maximum reconnect backoff cap */
export const MAX_RECONNECT_DELAY_MS = 60_000;

// --- Channel reconciliation ---
/** Polling interval when WebSocket is connected (safety net) */
export const RECONCILE_INTERVAL_MS = 60_000;
/** Polling interval when WebSocket is disconnected (fallback) */
export const FALLBACK_POLL_MS = 10_000;

// --- Process lifecycle ---
/** Timeout before force-exiting if cleanup hangs */
export const FORCE_EXIT_TIMEOUT_MS = 3_000;
/** Interval for checking if parent process is still alive */
export const PARENT_WATCH_INTERVAL_MS = 5_000;

// --- Diff / stuckness detection ---
/** Minutes on same activity before flagging as potentially stuck */
export const STUCKNESS_THRESHOLD_MINUTES = 15;

// --- Heartbeat ---
/** Consecutive heartbeat failures before giving up */
export const MAX_HEARTBEAT_FAILURES = 20;

// --- String length limits ---
/** Max length for terminal tab title labels */
export const TITLE_MAX_LENGTH = 40;

// --- API client defaults ---
/** Default request timeout for the MCP API client */
export const API_TIMEOUT_MS = 10_000;
/** Max retry attempts for non-timeout failures */
export const API_MAX_RETRY_ATTEMPTS = 2;
/** Max retry attempts for timeout failures */
export const API_MAX_TIMEOUT_RETRY_ATTEMPTS = 1;
