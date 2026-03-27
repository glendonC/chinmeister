// Pure text utilities used by TeamDO for path normalization.

// Strip leading ./ and trailing /, collapse // — so "src/index.js" and "./src/index.js" match
export function normalizePath(p) {
  return p.replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
}
