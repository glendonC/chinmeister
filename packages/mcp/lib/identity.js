// Shared identity utilities for MCP server, channel, and hook.

import { createHash, randomBytes } from 'crypto';

export function detectToolName(defaultTool = 'unknown') {
  const idx = process.argv.indexOf('--tool');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (process.env.CHINWAG_TOOL) return process.env.CHINWAG_TOOL;
  return defaultTool;
}

// Deterministic base ID: same token + tool = same ID. Used by hooks and channel.
export function generateAgentId(token, toolName) {
  const hash = createHash('sha256').update(token).digest('hex').slice(0, 12);
  return `${toolName}:${hash}`;
}

// Per-process unique ID: base + random suffix. Used by MCP server processes.
// Each Claude Code session gets a distinct member entry in the team.
export function generateSessionAgentId(token, toolName) {
  const base = generateAgentId(token, toolName);
  const suffix = randomBytes(4).toString('hex');
  return `${base}:${suffix}`;
}
