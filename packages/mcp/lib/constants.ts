// Shared constants for the chinwag MCP server.
// All magic numbers live here — import by name, never hardcode.
//
// Mirrors the worker's constants.js pattern: grouped by domain,
// every value named and documented.

// --- Context cache ---
/** TTL for cached team context before re-fetching */
export const CONTEXT_TTL_MS = 30_000;
/** Max age before stale cached context is discarded (returns null instead) */
export const CONTEXT_MAX_STALE_MS = 300_000;
/** How often to retry API when offline (instead of only on tool calls) */
export const CONTEXT_OFFLINE_RETRY_MS = 60_000;

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
/** Interval between heartbeat pings to the team DO */
export const HEARTBEAT_INTERVAL_MS = 30_000;
/** Consecutive heartbeat failures before giving up */
export const MAX_HEARTBEAT_FAILURES = 20;
/** Interval between recovery heartbeat attempts after heartbeat death */
export const HEARTBEAT_RECOVERY_INTERVAL_MS = 300_000;

// --- Reconnect backoff ---
/**
 * Compute the next reconnect delay with exponential backoff and jitter.
 * Jitter: 50-100% of the current delay to prevent thundering herd on mass reconnect.
 * Returns `{ jitteredDelay, nextDelay }` where nextDelay is the base for the next call.
 */
export function nextReconnectDelay(
  currentDelay: number,
  maxDelay: number = MAX_RECONNECT_DELAY_MS,
): { jitteredDelay: number; nextDelay: number } {
  const jitteredDelay = Math.round(currentDelay * (0.5 + Math.random() * 0.5));
  const nextDelay = Math.min(currentDelay * 2, maxDelay);
  return { jitteredDelay, nextDelay };
}

// --- String length limits ---
/** Max length for terminal tab title labels */
export const TITLE_MAX_LENGTH = 40;
/** Max length for a single file path in tool input */
export const FILE_PATH_MAX_LENGTH = 500;
/** Max number of files in activity/conflict checks */
export const FILE_LIST_MAX = 100;
/** Max number of files in lock claim/release */
export const LOCK_FILE_LIST_MAX = 20;
/** Max length for activity summary */
export const SUMMARY_MAX_LENGTH = 280;
/** Max length for memory text */
export const MEMORY_TEXT_MAX_LENGTH = 2000;
/** Max length for a single memory tag */
export const TAG_MAX_LENGTH = 50;
/** Max number of tags per memory */
export const TAG_LIST_MAX = 10;
/** Max length for memory search query */
export const SEARCH_QUERY_MAX_LENGTH = 200;
/** Max results for memory search */
export const SEARCH_LIMIT_MAX = 50;
/** Max length for chat message text */
export const MESSAGE_TEXT_MAX_LENGTH = 500;
/** Max length for message target agent ID */
export const MESSAGE_TARGET_MAX_LENGTH = 60;
/** Max length for model identifier */
export const MODEL_MAX_LENGTH = 100;
/** Max length for integration host/surface IDs */
export const INTEGRATION_ID_MAX_LENGTH = 50;
/** Max length for team ID */
export const TEAM_ID_MAX_LENGTH = 30;

// --- API client defaults ---
/** Default request timeout for the MCP API client */
export const API_TIMEOUT_MS = 10_000;
/** Max retry attempts for non-timeout failures */
export const API_MAX_RETRY_ATTEMPTS = 2;
/** Max retry attempts for timeout failures */
export const API_MAX_TIMEOUT_RETRY_ATTEMPTS = 1;

// --- Hook handler ---
/** Timeout for reading hook input from stdin */
export const STDIN_TIMEOUT_MS = 3_000;
/** Max bytes accepted from stdin before discarding (prevents OOM on malformed input) */
export const STDIN_MAX_BYTES = 1_000_000;
