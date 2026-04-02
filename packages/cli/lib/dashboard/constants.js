// Centralized constants for the TUI dashboard.
// Key bindings, magic numbers, and display limits live here
// so they're discoverable in one place and easily adjustable.

// ── Key bindings ──────────────────────────────────────
// Single-character shortcuts used by the input dispatcher.
export const KEYS = {
  NEW: 'n',
  KILL: 'x',
  RESTART: 'r',
  DIAGNOSTICS: 'l',
  MESSAGE: 'm',
  SESSIONS: 's',
  WEB: 'w',
  KNOWLEDGE: 'k',
  FIX: 'f',
  COMMAND: '/',
  ADD_MEMORY: 'a',
  DELETE_MEMORY: 'd',
  QUIT: 'q',
  RETRY: 'r',
};

// ── Display limits ────────────────────────────────────
export const MAX_MEMORIES = 8;
export const RECENTLY_FINISHED_LIMIT = 3;
export const MIN_VIEWPORT_ROWS = 4;
export const VIEWPORT_CHROME_ROWS = 11;
export const COMMAND_SUGGESTION_LIMIT = 5;
export const VISIBLE_MESSAGE_COUNT = 15;

// ── Timing ────────────────────────────────────────────
export const SPINNER_INTERVAL_MS = 80;
