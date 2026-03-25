/**
 * Format a duration in minutes to a human-readable string.
 * @param {number|null} m - minutes
 * @returns {string}
 */
export function formatDuration(m) {
  if (m == null || typeof m !== 'number' || m <= 0) return '<1m';
  if (m >= 60) return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  return `${Math.round(m)}m`;
}

/** Known memory categories for styling */
export const MEMORY_CATEGORIES = new Set(['gotcha', 'config', 'decision', 'pattern', 'reference']);
