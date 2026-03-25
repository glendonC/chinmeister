#!/usr/bin/env node

// chinwag MCP server — connects AI agents to the chinwag network.
// Runs locally via stdio transport. Reads ~/.chinwag/config.json for auth.
// CRITICAL: Never use console.log — it corrupts stdio JSON-RPC. Use console.error.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { loadConfig, configExists } from './lib/config.js';
import { api } from './lib/api.js';
import { scanEnvironment } from './lib/profile.js';
import { findTeamFile, teamHandlers } from './lib/team.js';

function detectToolName() {
  const idx = process.argv.indexOf('--tool');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (process.env.CHINWAG_TOOL) return process.env.CHINWAG_TOOL;
  return 'unknown';
}

function generateAgentId(token, toolName) {
  const hash = createHash('sha256').update(token).digest('hex').slice(0, 12);
  return `${toolName}:${hash}`;
}

let PKG = { version: '0.0.0' };
try {
  PKG = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
} catch { /* fallback if bundled or path changes */ }

async function main() {
  if (!configExists()) {
    console.error('[chinwag] No config found. Run `npx chinwag` first to create an account.');
    process.exit(1);
  }

  const config = loadConfig();
  if (!config?.token) {
    console.error('[chinwag] Invalid config — missing token. Run `npx chinwag` to re-initialize.');
    process.exit(1);
  }

  const toolName = detectToolName();
  const agentId = generateAgentId(config.token, toolName);
  const client = api(config, { agentId });
  console.error(`[chinwag] Tool: ${toolName}, Agent ID: ${agentId}`);

  // Scan environment and register profile
  const profile = scanEnvironment();
  try {
    await client.put('/agent/profile', profile);
    console.error(`[chinwag] Profile registered: ${[...profile.languages, ...profile.frameworks].join(', ') || 'no stack detected'}`);
  } catch (err) {
    console.error('[chinwag] Failed to register profile:', err.message);
  }

  // Check for .chinwag team file
  let currentTeamId = findTeamFile();
  let heartbeatInterval = null;
  let currentSessionId = null;
  const team = teamHandlers(client);

  const projectName = basename(process.cwd());

  if (currentTeamId) {
    try {
      await team.joinTeam(currentTeamId, projectName);
      console.error(`[chinwag] Auto-joined team ${currentTeamId}`);

      // Start observability session
      try {
        const session = await team.startSession(currentTeamId, profile.framework);
        currentSessionId = session.session_id;
        console.error(`[chinwag] Session started: ${currentSessionId}`);
      } catch (err) {
        console.error('[chinwag] Failed to start session:', err.message);
      }

      heartbeatInterval = setInterval(async () => {
        try {
          await team.heartbeat(currentTeamId);
        } catch (err) {
          console.error('[chinwag] Heartbeat failed:', err.message);
        }
      }, 30_000);
    } catch (err) {
      console.error(`[chinwag] Failed to join team ${currentTeamId}:`, err.message);
      currentTeamId = null;
    }
  }

  // Clean up on exit — end session then exit.
  // Second signal or 3s timeout = force exit (don't hang on network issues).
  let cleaning = false;
  const cleanup = () => {
    if (cleaning) { process.exit(0); return; }
    cleaning = true;
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    const forceExit = setTimeout(() => process.exit(0), 3000);
    forceExit.unref();
    const done = () => { clearTimeout(forceExit); process.exit(0); };
    if (currentSessionId && currentTeamId) {
      team.endSession(currentTeamId, currentSessionId).catch(() => {}).finally(done);
    } else {
      done();
    }
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.stdin.on('end', cleanup);

  // Create MCP server
  const server = new McpServer({
    name: 'chinwag',
    version: PKG.version,
    instructions: `You are connected to chinwag — a shared brain for your team's AI coding agents. Other agents (potentially from different tools like Cursor, Claude Code, Windsurf) may be working on this project right now.

CRITICAL WORKFLOW — follow these steps every session:
1. FIRST call chinwag_get_team_context to see who's working, what files are active, any locked files, recent messages, and shared project knowledge.
2. BEFORE editing any file, call chinwag_check_conflicts with the files you plan to modify. If a file is locked or another agent is editing it, coordinate first — use chinwag_send_message to notify them.
3. AFTER you start editing, call chinwag_claim_files to lock the files you're working on, then call chinwag_update_activity with your file list and a brief summary.
4. When you discover something important about the project (setup requirements, gotchas, conventions, decisions), call chinwag_save_memory so every future agent session starts with that knowledge.
5. When done with files, call chinwag_release_files so other agents can work on them.

This coordination prevents merge conflicts across tools and builds shared project intelligence.`,
  });

  registerTools(server, client, team, () => currentTeamId);
  registerResources(server, client, profile);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[chinwag] MCP server running');
}

// --- Tools ---

// Shared context cache — serves as both preamble source and offline fallback.
// When the API is unreachable, tools return this cached state with an [offline] tag.
let cachedContext = null;
let cachedContextAt = 0;
let cachedContextTeam = null;
let isOffline = false;
const CONTEXT_TTL_MS = 30_000;

async function refreshContext(team, teamId) {
  if (!teamId) return null;
  const now = Date.now();
  if (cachedContext && cachedContextTeam === teamId && now - cachedContextAt < CONTEXT_TTL_MS) {
    return cachedContext;
  }
  try {
    cachedContext = await team.getTeamContext(teamId);
    cachedContextAt = now;
    cachedContextTeam = teamId;
    if (isOffline) {
      isOffline = false;
      console.error('[chinwag] Back online');
    }
    return cachedContext;
  } catch {
    if (!isOffline) {
      isOffline = true;
      console.error('[chinwag] API unreachable — using cached context');
    }
    return cachedContext; // may be null if never fetched
  }
}

function offlinePrefix() {
  return isOffline ? '[offline — using cached data] ' : '';
}

let lastPreambleState = '';

async function teamPreamble(team, teamId) {
  const ctx = await refreshContext(team, teamId);
  if (!ctx) return isOffline ? '[offline] ' : '';
  const active = ctx.members?.filter(m => m.status === 'active') || [];
  if (active.length === 0) return offlinePrefix();

  const summary = active.map(m => {
    const toolTag = m.tool && m.tool !== 'unknown' ? ` (${m.tool})` : '';
    const files = m.activity?.files?.join(', ') || 'idle';
    return `${m.handle}${toolTag}: ${files}`;
  }).join(' | ');

  const lockCount = ctx.locks?.length || 0;
  const msgCount = ctx.messages?.length || 0;
  const extras = [];
  if (lockCount > 0) extras.push(`${lockCount} locked file${lockCount > 1 ? 's' : ''}`);
  if (msgCount > 0) extras.push(`${msgCount} message${msgCount > 1 ? 's' : ''}`);

  const currentState = `${summary}|${extras.join(',')}`;
  // Only show preamble when state has changed (avoids noise on repeated calls)
  if (currentState === lastPreambleState) return offlinePrefix();
  lastPreambleState = currentState;

  const extraStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';
  return `${offlinePrefix()}[Team: ${summary}${extraStr}]\n\n`;
}

function registerTools(server, client, team, getTeamId) {
  server.tool(
    'chinwag_join_team',
    {
      description: 'Join a chinwag team for multi-agent coordination. Agents on the same team can see what each other is working on and detect file conflicts before they happen.',
      inputSchema: z.object({
        team_id: z.string().max(30).regex(/^[a-zA-Z0-9_-]+$/).describe('Team ID (e.g., t_a7x9k2m). Found in the .chinwag file at the repo root.'),
      }),
    },
    async ({ team_id }) => {
      try {
        await team.joinTeam(team_id);
        currentTeamId = team_id;
        cachedContext = null;

        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(async () => {
          try { await team.heartbeat(currentTeamId); } catch (err) {
            console.error('[chinwag] Heartbeat failed:', err.message);
          }
        }, 30_000);

        try {
          const session = await team.startSession(currentTeamId, profile.framework);
          if (session?.session_id) currentSessionId = session.session_id;
        } catch {}

        return { content: [{ type: 'text', text: `Joined team ${team_id}. Session started.` }] };
      } catch (err) {
        const msg = err.status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : err.message;
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );

  server.tool(
    'chinwag_update_activity',
    {
      description: 'Report what files you are currently working on. IMPORTANT: Call this immediately after chinwag_claim_files to broadcast your activity. Other agents across all tools will see this in their team context.',
      inputSchema: z.object({
        files: z.array(z.string().max(500)).max(100).describe('File paths being modified'),
        summary: z.string().max(280).describe('Brief description, e.g. "Refactoring auth middleware"'),
      }),
    },
    async ({ files, summary }) => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team. Join one first with chinwag_join_team.' }], isError: true };
      }
      try {
        await team.updateActivity(teamId, files, summary);
        const preamble = await teamPreamble(team, teamId);
        return { content: [{ type: 'text', text: `${preamble}Activity updated: ${summary}` }] };
      } catch (err) {
        const msg = err.status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : err.message;
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );

  server.tool(
    'chinwag_check_conflicts',
    {
      description: 'Check if any teammate agents are working on the same files you plan to edit. Call this BEFORE starting edits on shared code to avoid merge conflicts.',
      inputSchema: z.object({
        files: z.array(z.string().max(500)).max(100).describe('File paths you plan to modify'),
      }),
    },
    async ({ files }) => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team.' }], isError: true };
      }
      try {
        const result = await team.checkConflicts(teamId, files);
        const preamble = await teamPreamble(team, teamId);
        const lines = [];
        if (result.conflicts?.length > 0) {
          for (const c of result.conflicts) {
            const who = c.tool && c.tool !== 'unknown' ? `${c.owner_handle} (${c.tool})` : c.owner_handle;
            lines.push(`⚠ ${who} is working on ${c.files.join(', ')} — "${c.summary}"`);
          }
        }
        if (result.locked?.length > 0) {
          for (const l of result.locked) {
            const who = l.tool && l.tool !== 'unknown' ? `${l.held_by} (${l.tool})` : l.held_by;
            lines.push(`🔒 ${l.file} is locked by ${who}`);
          }
        }
        if (lines.length === 0) {
          return { content: [{ type: 'text', text: `${preamble}No conflicts. Safe to proceed.` }] };
        }
        return { content: [{ type: 'text', text: `${preamble}${lines.join('\n')}` }] };
      } catch (err) {
        if (err.status === 401) {
          return { content: [{ type: 'text', text: 'Authentication expired. Please restart your editor to reconnect.' }], isError: true };
        }
        // Offline fallback: check cached context for potential conflicts
        if (cachedContext?.members) {
          const myFiles = new Set(files);
          const warnings = [];
          for (const m of cachedContext.members) {
            if (m.status !== 'active' || !m.activity?.files) continue;
            const overlap = m.activity.files.filter(f => myFiles.has(f));
            if (overlap.length > 0) {
              const who = m.tool && m.tool !== 'unknown' ? `${m.handle} (${m.tool})` : m.handle;
              warnings.push(`⚠ ${who} was working on ${overlap.join(', ')} (cached)`);
            }
          }
          if (warnings.length > 0) {
            return { content: [{ type: 'text', text: `[offline — cached check]\n${warnings.join('\n')}` }] };
          }
          return { content: [{ type: 'text', text: '[offline] No cached conflicts. Proceed with caution.' }] };
        }
        return { content: [{ type: 'text', text: '[offline] Could not check conflicts. Proceed with caution.' }] };
      }
    }
  );

  server.tool(
    'chinwag_get_team_context',
    {
      description: 'Get the full state of your team: who is online, what everyone is working on, and any file overlaps. Use this to orient yourself before starting work.',
      inputSchema: z.object({}),
    },
    async () => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team.' }], isError: true };
      }
      const ctx = await refreshContext(team, teamId);
      if (!ctx) {
        return { content: [{ type: 'text', text: 'No team context available (API unreachable, no cached data).' }], isError: true };
      }

      const lines = [];
      if (isOffline) lines.push('[offline — showing cached data]');

      if (!ctx.members || ctx.members.length === 0) {
        lines.push('No other agents connected.');
      } else {
        lines.push('Agents:');
        for (const m of ctx.members) {
          const toolInfo = m.tool && m.tool !== 'unknown' ? `, ${m.tool}` : '';
          const activity = m.activity
            ? `working on ${m.activity.files.join(', ')} — "${m.activity.summary}"`
            : 'idle';
          lines.push(`  ${m.handle} (${m.status}${toolInfo}): ${activity}`);
        }
      }

      if (ctx.locks && ctx.locks.length > 0) {
        lines.push('');
        lines.push('Locked files:');
        for (const l of ctx.locks) {
          const who = l.tool && l.tool !== 'unknown' ? `${l.owner_handle} (${l.tool})` : l.owner_handle;
          lines.push(`  ${l.file_path} — ${who} (${Math.round(l.minutes_held)}m)`);
        }
      }

      if (ctx.messages && ctx.messages.length > 0) {
        lines.push('');
        lines.push('Messages:');
        for (const msg of ctx.messages) {
          const from = msg.from_tool && msg.from_tool !== 'unknown' ? `${msg.from_handle} (${msg.from_tool})` : msg.from_handle;
          lines.push(`  ${from}: ${msg.text}`);
        }
      }

      if (ctx.memories && ctx.memories.length > 0) {
        lines.push('');
        lines.push('Project knowledge:');
        for (const mem of ctx.memories) {
          lines.push(`  [${mem.category}] ${mem.text}`);
        }
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );
  server.tool(
    'chinwag_save_memory',
    {
      description: 'Save a project fact or learning that other agents on the team should know. Use this when you discover something important about the project that would help other agents. These persist across sessions and are shared with all team agents.',
      inputSchema: z.object({
        text: z.string().max(2000).describe('The fact or learning to save. Be specific and actionable, e.g. "Tests require Redis running on port 6379" or "API docs: https://docs.stripe.com/api"'),
        category: z.enum(['gotcha', 'pattern', 'config', 'decision', 'reference']).describe('Category: "gotcha" (pitfalls), "pattern" (conventions), "config" (setup facts), "decision" (architecture), "reference" (URLs, docs, external resources)'),
      }),
    },
    async ({ text, category }) => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team. Join one first with chinwag_join_team.' }], isError: true };
      }
      try {
        await team.saveMemory(teamId, text, category);
        const preamble = await teamPreamble(team, teamId);
        return { content: [{ type: 'text', text: `${preamble}Memory saved [${category}]: ${text}` }] };
      } catch (err) {
        const msg = err.status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : err.message;
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );

  server.tool(
    'chinwag_search_memory',
    {
      description: 'Search team project memories by keyword and/or category. Use this to find specific knowledge the team has saved, like setup requirements, conventions, or past decisions.',
      inputSchema: z.object({
        query: z.string().max(200).optional().describe('Search text (matches against memory content)'),
        category: z.enum(['gotcha', 'pattern', 'config', 'decision', 'reference']).optional().describe('Filter by category'),
        limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
      }),
    },
    async ({ query, category, limit }) => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team.' }], isError: true };
      }
      try {
        const result = await team.searchMemories(teamId, query, category, limit);
        if (!result.memories || result.memories.length === 0) {
          return { content: [{ type: 'text', text: 'No memories found.' }] };
        }
        const lines = result.memories.map(m =>
          `[${m.category}] ${m.text} (id: ${m.id}, by ${m.source_handle})`
        );
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        const msg = err.status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : err.message;
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );

  server.tool(
    'chinwag_delete_memory',
    {
      description: 'Delete a team memory by ID. Use chinwag_search_memory first to find the ID of the memory to delete. Use this to remove outdated, incorrect, or redundant knowledge.',
      inputSchema: z.object({
        id: z.string().describe('Memory ID to delete (UUID format, get from chinwag_search_memory)'),
      }),
    },
    async ({ id }) => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team.' }], isError: true };
      }
      try {
        const result = await team.deleteMemory(teamId, id);
        if (result.error) {
          return { content: [{ type: 'text', text: result.error }], isError: true };
        }
        return { content: [{ type: 'text', text: `Memory ${id} deleted.` }] };
      } catch (err) {
        const msg = err.status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : err.message;
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );

  server.tool(
    'chinwag_claim_files',
    {
      description: 'Claim advisory locks on files you are about to edit. Other agents will be warned if they try to edit locked files. Locks auto-release when your session ends or you stop heartbeating.',
      inputSchema: z.object({
        files: z.array(z.string().max(500)).max(20).describe('File paths to claim'),
      }),
    },
    async ({ files }) => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team.' }], isError: true };
      }
      try {
        const result = await team.claimFiles(teamId, files);
        const preamble = await teamPreamble(team, teamId);
        const lines = [];
        if (result.claimed?.length > 0) lines.push(`Claimed: ${result.claimed.join(', ')}`);
        if (result.blocked?.length > 0) {
          for (const b of result.blocked) {
            const who = b.tool !== 'unknown' ? `${b.held_by} (${b.tool})` : b.held_by;
            lines.push(`Blocked: ${b.file} — held by ${who}`);
          }
        }
        return { content: [{ type: 'text', text: `${preamble}${lines.join('\n')}` }] };
      } catch (err) {
        const msg = err.status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : err.message;
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );

  server.tool(
    'chinwag_release_files',
    {
      description: 'Release advisory locks on files you previously claimed. Call this when you are done editing files so other agents can work on them.',
      inputSchema: z.object({
        files: z.array(z.string().max(500)).max(20).optional().describe('File paths to release (omit to release all your locks)'),
      }),
    },
    async ({ files }) => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team.' }], isError: true };
      }
      try {
        await team.releaseFiles(teamId, files);
        const msg = files ? `Released: ${files.join(', ')}` : 'All locks released.';
        return { content: [{ type: 'text', text: msg }] };
      } catch (err) {
        const msg = err.status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : err.message;
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );

  server.tool(
    'chinwag_send_message',
    {
      description: 'Send a message to other agents on the team. Messages are ephemeral (auto-expire after 1 hour). Use this to coordinate with other agents — e.g. "I just refactored auth.js, rebase before editing" or "Need help with failing tests in api/".',
      inputSchema: z.object({
        text: z.string().max(500).describe('Message text'),
        target: z.string().max(60).optional().describe('Target agent_id for a direct message (omit to broadcast to all)'),
      }),
    },
    async ({ text, target }) => {
      const teamId = getTeamId();
      if (!teamId) {
        return { content: [{ type: 'text', text: 'Not in a team.' }], isError: true };
      }
      try {
        await team.sendMessage(teamId, text, target);
        const dest = target ? `to ${target}` : 'to team';
        return { content: [{ type: 'text', text: `Message sent ${dest}: ${text}` }] };
      } catch (err) {
        const msg = err.status === 401 ? 'Authentication expired. Please restart your editor to reconnect.' : err.message;
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );
}

// --- Resources ---

function registerResources(server, client, cachedProfile) {
  server.resource(
    'profile',
    'chinwag://profile',
    { description: 'Your agent profile — languages, frameworks, tools detected from your environment.', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'chinwag://profile',
        mimeType: 'application/json',
        text: JSON.stringify(cachedProfile, null, 2),
      }],
    })
  );
}

main().catch((err) => {
  console.error('[chinwag] Fatal error:', err);
  process.exit(1);
});
