// Shared helpers for writing MCP config files and detecting tools.
// Used by both `chinwag init` and `chinwag add`.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';
import { MCP_TOOLS } from './tools.js';

export function detectTools(cwd) {
  return MCP_TOOLS.filter(tool => {
    const { dirs = [], cmds = [] } = tool.detect;
    return dirs.some(d => existsSync(join(cwd, d))) ||
           cmds.some(c => commandExists(c));
  });
}

export function commandExists(cmd) {
  try {
    const bin = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(bin, [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function writeMcpConfig(cwd, relativePath, { channel = false } = {}) {
  const filePath = join(cwd, relativePath);

  let existing = {};
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.error(`[chinwag] Warning: ${relativePath} has invalid JSON (${err.message}). Existing entries will be lost.`);
    }
  }

  if (!existing.mcpServers) existing.mcpServers = {};
  existing.mcpServers.chinwag = { command: 'npx', args: ['chinwag-mcp'] };

  if (channel) {
    existing.mcpServers['chinwag-channel'] = { command: 'npx', args: ['chinwag-channel'] };
  }

  try {
    const dir = dirname(relativePath);
    if (dir !== '.') mkdirSync(join(cwd, dir), { recursive: true });
    writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n');
  } catch (err) {
    return { error: `Failed to write ${relativePath}: ${err.message}` };
  }
  return { ok: true };
}

export function writeHooksConfig(cwd) {
  const claudeDir = join(cwd, '.claude');

  try {
    mkdirSync(claudeDir, { recursive: true });
  } catch (err) {
    return { error: `Failed to create .claude directory: ${err.message}` };
  }

  const filePath = join(claudeDir, 'settings.json');

  let existing = {};
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.error(`[chinwag] Warning: .claude/settings.json has invalid JSON (${err.message}). Existing entries will be lost.`);
    }
  }

  if (!existing.hooks) existing.hooks = {};

  const chinwagHooks = {
    PreToolUse: [{ matcher: 'Edit|Write', command: 'chinwag-hook check-conflict' }],
    PostToolUse: [{ matcher: 'Edit|Write', command: 'chinwag-hook report-edit' }],
    SessionStart: [{ command: 'chinwag-hook session-start' }],
  };

  for (const [event, entries] of Object.entries(chinwagHooks)) {
    if (!existing.hooks[event]) existing.hooks[event] = [];

    for (const entry of entries) {
      const hasChinwag = existing.hooks[event].some(h =>
        h.command === entry.command || h.command?.startsWith('chinwag-hook ')
      );
      if (!hasChinwag) {
        existing.hooks[event].push(entry);
      }
    }
  }

  try {
    writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n');
  } catch (err) {
    return { error: `Failed to write .claude/settings.json: ${err.message}` };
  }
  return { ok: true };
}

// Configure a single tool by id. Returns { ok, detail } or { error }.
export function configureTool(cwd, toolId) {
  const tool = MCP_TOOLS.find(t => t.id === toolId);
  if (!tool) return { error: `Unknown MCP tool: ${toolId}` };

  const mcpResult = writeMcpConfig(cwd, tool.mcpConfig, { channel: tool.channel });
  if (mcpResult.error) return mcpResult;

  if (tool.hooks) {
    const hookResult = writeHooksConfig(cwd);
    if (hookResult.error) return hookResult;
  }

  let detail = tool.mcpConfig;
  if (tool.hooks) detail += ' + hooks';
  if (tool.channel) detail += ' + channel';

  return { ok: true, name: tool.name, detail };
}
