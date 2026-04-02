// Shared file-path normalization for MCP tool handlers.
// Ensures consistent comparison across tools — activity, conflicts, and locks
// all see the same canonical form of a file path.

import path from 'path';

/**
 * Normalize a file path for consistent cross-tool comparison.
 * Uses path.posix.normalize for robust handling of ./, ../, and duplicate
 * slashes, then strips any trailing slash. posix ensures consistent
 * forward-slash behavior regardless of platform.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function normalizePath(filePath) {
  return path.posix.normalize(filePath).replace(/\/$/, '');
}

/**
 * Normalize an array of file paths, deduplicating after normalization.
 *
 * @param {string[]} files
 * @returns {string[]}
 */
export function normalizeFiles(files) {
  return [...new Set(files.map(normalizePath))];
}
