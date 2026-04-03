// Centralized constants for the TUI dashboard.
// Key bindings, magic numbers, and display limits live here
// so they're discoverable in one place and easily adjustable.

// ── Key bindings ──────────────────────────────────────
// Single-character shortcuts used by the input dispatcher.
export const KEYS: Record<string, string> = {
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
export const MAX_MEMORIES: number = 8;
export const RECENTLY_FINISHED_LIMIT: number = 3;
export const MIN_VIEWPORT_ROWS: number = 4;
export const VIEWPORT_CHROME_ROWS: number = 11;
export const COMMAND_SUGGESTION_LIMIT: number = 5;
export const VISIBLE_MESSAGE_COUNT: number = 15;

// ── Timing ────────────────────────────────────────────
export const SPINNER_INTERVAL_MS: number = 80;
