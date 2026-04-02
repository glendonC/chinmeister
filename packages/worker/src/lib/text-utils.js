// Pure text utilities used by TeamDO for path normalization and date formatting.

// Strip leading ./ and trailing /, collapse // — so "src/index.js" and "./src/index.js" match
export function normalizePath(p) {
  return p.replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
}

// Convert a JS Date (or now) to SQLite-compatible datetime string: "YYYY-MM-DD HH:MM:SS"
export function toSQLDateTime(date) {
  return (date || new Date()).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}
