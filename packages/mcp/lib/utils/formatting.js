// Shared formatting utilities for agent labels and tool tags.
// Used across tools, hooks, channels, and context display.

/**
 * Format a tool tag string, returning empty string for unknown/missing tools.
 * @param {string} tool - Tool name (e.g. 'cursor', 'unknown', undefined)
 * @returns {string} e.g. ' (cursor)' or ''
 */
export function formatToolTag(tool) {
  return tool && tool !== 'unknown' ? ` (${tool})` : '';
}

/**
 * Format an agent's display label: handle + optional (tool) suffix.
 * @param {{ handle: string, tool?: string }} member
 * @returns {string} e.g. 'alice (cursor)' or 'alice'
 */
export function formatAgentLabel(member) {
  return `${member.handle}${formatToolTag(member.tool)}`;
}

/**
 * Format a "who" label from separate handle and tool fields.
 * Used when the handle and tool are separate variables (e.g. conflict results).
 * @param {string} handle
 * @param {string} [tool]
 * @returns {string} e.g. 'alice (cursor)' or 'alice'
 */
export function formatWho(handle, tool) {
  return `${handle}${formatToolTag(tool)}`;
}
