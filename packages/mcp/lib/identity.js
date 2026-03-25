// Shared identity utilities for MCP server, channel, and hook.

import { createHash } from 'crypto';

export function detectToolName(defaultTool = 'unknown') {
  const idx = process.argv.indexOf('--tool');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (process.env.CHINWAG_TOOL) return process.env.CHINWAG_TOOL;
  return defaultTool;
}

export function generateAgentId(token, toolName) {
  const hash = createHash('sha256').update(token).digest('hex').slice(0, 12);
  return `${toolName}:${hash}`;
}
