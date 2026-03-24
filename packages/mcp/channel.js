#!/usr/bin/env node

// chinwag channel — pushes real-time team state changes into Claude Code sessions.
// This is a separate MCP server process that declares the claude/channel capability.
// It polls the backend for team context, diffs against previous state, and emits
// notifications for meaningful changes (new agents, file edits, conflicts, memories).
//
// Unlike the main MCP server, the channel server has no tools — it only pushes.
// CRITICAL: Never console.log — stdio transport. Use console.error for logging.

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, configExists } from './lib/config.js';
import { api } from './lib/api.js';
import { findTeamFile } from './lib/team.js';

function detectToolName() {
  const idx = process.argv.indexOf('--tool');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (process.env.CHINWAG_TOOL) return process.env.CHINWAG_TOOL;
  return 'claude-code'; // Channel is Claude Code-only
}

function generateAgentId(token, toolName) {
  const hash = createHash('sha256').update(token).digest('hex').slice(0, 12);
  return `${toolName}:${hash}`;
}

let PKG = { version: '0.0.0' };
try {
  PKG = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
} catch { /* fallback if bundled or path changes */ }

const POLL_INTERVAL_MS = 10_000;

async function main() {
  if (!configExists()) {
    console.error('[chinwag-channel] No config found.');
    process.exit(1);
  }

  const config = loadConfig();
  if (!config?.token) {
    console.error('[chinwag-channel] Invalid config — missing token.');
    process.exit(1);
  }

  const teamId = findTeamFile();
  if (!teamId) {
    console.error('[chinwag-channel] No .chinwag file — channel inactive.');
    process.exit(0);
  }

  const toolName = detectToolName();
  const agentId = generateAgentId(config.token, toolName);
  const client = api(config, { agentId });
  console.error(`[chinwag-channel] Tool: ${toolName}, Agent ID: ${agentId}`);

  const server = new Server(
    { name: 'chinwag-channel', version: PKG.version },
    {
      capabilities: {
        experimental: { 'claude/channel': {} },
      },
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[chinwag-channel] Channel server running');

  // MCP server handles joining. Channel only reads context + heartbeats.

  // State diffing + stuckness tracking
  let prevState = null;
  const stucknessAlerted = new Map(); // handle → updated_at when alert was sent

  const poll = async () => {
    try {
      const ctx = await client.get(`/teams/${teamId}/context`);
      if (prevState) {
        const events = diffState(prevState, ctx, stucknessAlerted);
        for (const event of events) {
          await pushEvent(server, event);
        }
      }
      prevState = ctx;
    } catch (err) {
      console.error(`[chinwag-channel] Poll failed: ${err.message}`);
    }
  };

  // Initial fetch (don't emit events on first poll)
  try {
    prevState = await client.get(`/teams/${teamId}/context`);
  } catch {
    // Will retry on next interval
  }

  const interval = setInterval(poll, POLL_INTERVAL_MS);

  // Heartbeat to keep membership alive
  const heartbeat = setInterval(async () => {
    try {
      await client.post(`/teams/${teamId}/heartbeat`, {});
    } catch {}
  }, 30_000);

  const cleanup = () => {
    clearInterval(interval);
    clearInterval(heartbeat);
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// --- State diffing ---

const STUCKNESS_THRESHOLD_MINUTES = 15;

function agentKey(m) {
  return m.agent_id || m.handle;
}

function agentLabel(m) {
  if (m.tool && m.tool !== 'unknown') return `${m.handle} (${m.tool})`;
  return m.handle;
}

function diffState(prev, curr, stucknessAlerted) {
  const events = [];

  const prevKeys = new Set(prev.members?.map(agentKey) || []);
  const currKeys = new Set(curr.members?.map(agentKey) || []);
  const prevByKey = new Map((prev.members || []).map(m => [agentKey(m), m]));
  const currByKey = new Map((curr.members || []).map(m => [agentKey(m), m]));

  // New agents joined
  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      const m = currByKey.get(key);
      const activity = m.activity ? ` — working on ${m.activity.files.join(', ')}` : '';
      events.push(`Agent ${agentLabel(m)} joined the team${activity}`);
    }
  }

  // Agents went offline
  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      const m = prevByKey.get(key);
      events.push(`Agent ${agentLabel(m)} disconnected`);
    }
  }

  // File activity changes
  for (const key of currKeys) {
    if (!prevKeys.has(key)) continue;
    const prevMember = prevByKey.get(key);
    const currMember = currByKey.get(key);
    if (!prevMember || !currMember) continue;

    const prevFiles = new Set(prevMember.activity?.files || []);
    const currFiles = currMember.activity?.files || [];
    const newFiles = currFiles.filter(f => !prevFiles.has(f));

    if (newFiles.length > 0) {
      events.push(`${agentLabel(currMember)} started editing ${newFiles.join(', ')}`);
    }
  }

  // Conflict detection — only emit NEW conflicts (not in prev state)
  const prevConflictFiles = new Set();
  const prevFileOwners = new Map();
  for (const m of (prev.members || [])) {
    if (m.status !== 'active' || !m.activity?.files) continue;
    for (const f of m.activity.files) {
      if (!prevFileOwners.has(f)) prevFileOwners.set(f, []);
      prevFileOwners.get(f).push(agentLabel(m));
    }
  }
  for (const [file, owners] of prevFileOwners) {
    if (owners.length > 1) prevConflictFiles.add(file);
  }

  const currFileOwners = new Map();
  for (const m of (curr.members || [])) {
    if (m.status !== 'active' || !m.activity?.files) continue;
    for (const f of m.activity.files) {
      if (!currFileOwners.has(f)) currFileOwners.set(f, []);
      currFileOwners.get(f).push(agentLabel(m));
    }
  }
  for (const [file, owners] of currFileOwners) {
    if (owners.length > 1 && !prevConflictFiles.has(file)) {
      events.push(`CONFLICT: ${owners.join(' and ')} are both editing ${file}`);
    }
  }

  // Stuckness detection — prefer server-computed minutes_since_update
  for (const key of currKeys) {
    const m = currByKey.get(key);
    if (!m?.activity?.updated_at || m.status !== 'active') continue;

    const alertedAt = stucknessAlerted.get(key);
    if (alertedAt && alertedAt !== m.activity.updated_at) {
      stucknessAlerted.delete(key);
    }

    if (!stucknessAlerted.has(key)) {
      const minutesOnSameActivity = m.minutes_since_update != null
        ? m.minutes_since_update
        : (Date.now() - new Date(m.activity.updated_at).getTime()) / 60_000;
      if (minutesOnSameActivity > STUCKNESS_THRESHOLD_MINUTES) {
        events.push(`Agent ${agentLabel(m)} has been on the same task for ${Math.round(minutesOnSameActivity)} min — may be stuck`);
        stucknessAlerted.set(key, m.activity.updated_at);
      }
    }
  }

  // Clear alerts for agents that disconnected
  for (const key of stucknessAlerted.keys()) {
    if (!currKeys.has(key)) {
      stucknessAlerted.delete(key);
    }
  }

  // New memories — compare by id (preferred) or text
  const prevMemKeys = new Set((prev.memories || []).map(m => m.id || m.text));
  for (const mem of (curr.memories || [])) {
    const key = mem.id || mem.text;
    if (!prevMemKeys.has(key)) {
      events.push(`New team knowledge: [${mem.category}] ${mem.text}`);
    }
  }

  return events;
}

async function pushEvent(server, content) {
  try {
    await server.notification({
      method: 'notifications/claude/channel',
      params: { content },
    });
    console.error(`[chinwag-channel] Pushed: ${content}`);
  } catch (err) {
    console.error(`[chinwag-channel] Push failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error('[chinwag-channel] Fatal error:', err);
  process.exit(1);
});
