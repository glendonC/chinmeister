// Pure text utilities used by TeamDO for path normalization, date formatting,
// and safe JSON parsing of internal data.

// Strip leading ./ and trailing /, collapse //, remove .. segments — so paths can never escape the project root.
export function normalizePath(p) {
  let result = p.replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
  // Remove any ".." path segments to prevent path traversal
  result = result
    .split('/')
    .filter((seg) => seg !== '..')
    .join('/');
  // Clean up any leading slash that may result from stripping
  result = result.replace(/^\/+/, '');
  return result;
}

// Convert a JS Date (or now) to SQLite-compatible datetime string: "YYYY-MM-DD HH:MM:SS"
export function toSQLDateTime(date) {
  return (date || new Date())
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');
}

/**
 * Parse a JSON string stored in SQLite, returning fallback on failure.
 * Logs malformed data once per context string so schema bugs surface
 * in logs instead of silently returning empty arrays.
 *
 * @param {string} raw - Raw JSON string from DB column
 * @param {*} fallback - Value to return on parse failure (default: [])
 * @param {string} context - Identifier for log deduplication (e.g. "activity.files")
 * @returns {*} Parsed value or fallback
 */
const _loggedParseWarnings = new Set();
export function safeParseJSON(raw, fallback = [], context = 'unknown') {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    if (!_loggedParseWarnings.has(context)) {
      _loggedParseWarnings.add(context);
      console.error(
        `[chinwag] Malformed JSON in ${context}:`,
        err.message,
        '— raw:',
        raw.slice(0, 100),
      );
    }
    return fallback;
  }
}
