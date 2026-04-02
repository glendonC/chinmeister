// Pure text utilities used by TeamDO for path normalization and date formatting.

/**
 * Strip leading ./ and trailing /, collapse //, remove .. segments.
 * Prevents path traversal outside the project root.
 * @param {string} p
 * @returns {string}
 */
export function normalizePath(p) {
  let result = p.replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
  // Remove any ".." path segments to prevent path traversal
  result = result.split('/').filter(seg => seg !== '..').join('/');
  // Clean up any leading slash that may result from stripping
  result = result.replace(/^\/+/, '');
  return result;
}

/**
 * Convert a JS Date (or now) to SQLite-compatible datetime string: "YYYY-MM-DD HH:MM:SS"
 * @param {Date} [date]
 * @returns {string}
 */
export function toSQLDateTime(date) {
  return (date || new Date()).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}
