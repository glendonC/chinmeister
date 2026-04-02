// Shared display logic for formatting team context and conflict information.
// Used by both MCP tool handlers, hook handlers, and the channel server to avoid duplication.

import { formatToolTag, formatWho } from './formatting.js';

/**
 * Format a lock/activity duration in minutes to a human-readable string.
 * Single source of truth for duration formatting — used by context display,
 * stuckness insights, and diff-state.
 * @param {number} minutes - Duration in minutes
 * @returns {string} e.g. '5m', '120m'
 */
export function formatLockDuration(minutes) {
  return `${Math.round(minutes)}m`;
}

/**
 * Format a single team member into a display line.
 * @param {{ handle: string, status: string, tool?: string, activity?: { files: string[], summary?: string } }} member
 * @returns {string} e.g. '  alice (active, cursor): working on auth.js — "Fixing login"'
 */
export function formatMemberLine(member) {
  const toolInfo = formatToolTag(member.tool) ? `, ${member.tool}` : '';
  const activity = member.activity
    ? `working on ${member.activity.files.join(', ')}${member.activity.summary ? ` \u2014 "${member.activity.summary}"` : ''}`
    : 'idle';
  return `  ${member.handle} (${member.status}${toolInfo}): ${activity}`;
}

/**
 * Format a lock entry into a display line.
 * @param {{ file_path: string, owner_handle: string, tool?: string, minutes_held: number }} lock
 * @returns {string}
 */
export function formatLockLine(lock) {
  const who = formatWho(lock.owner_handle, lock.tool);
  return `  ${lock.file_path} \u2014 ${who} (${formatLockDuration(lock.minutes_held)})`;
}

/**
 * Format a memory entry into a display line.
 * @param {{ text: string, tags?: string[] }} memory
 * @returns {string}
 */
export function formatMemoryLine(memory) {
  const tagStr = memory.tags?.length ? ` [${memory.tags.join(', ')}]` : '';
  return `  ${memory.text}${tagStr}`;
}

/**
 * Format conflict and lock check results into human-readable warning lines.
 * @param {Array} conflicts - Conflict objects from team.checkConflicts()
 * @param {Array} lockedFiles - Locked file objects from team.checkConflicts()
 * @returns {string[]} Warning lines (empty array = no conflicts)
 */
export function formatConflictsList(conflicts, lockedFiles) {
  const lines = [];
  if (conflicts?.length > 0) {
    for (const c of conflicts) {
      const who = formatWho(c.owner_handle, c.tool);
      lines.push(`\u26A0 ${who} is working on ${c.files.join(', ')} \u2014 "${c.summary}"`);
    }
  }
  if (lockedFiles?.length > 0) {
    for (const l of lockedFiles) {
      const who = formatWho(l.held_by, l.tool);
      lines.push(`\uD83D\uDD12 ${l.file} is locked by ${who}`);
    }
  }
  return lines;
}

/**
 * Format full team context into a multi-line display string.
 * @param {object} ctx - Team context object from team.getTeamContext()
 * @param {object} [options]
 * @param {boolean} [options.showInsights] - Whether to show stuckness insights (hook uses this)
 * @returns {string[]} Display lines
 */
export function formatTeamContextDisplay(ctx, options = {}) {
  const lines = [];

  if (!ctx.members || ctx.members.length === 0) {
    return lines;
  }

  for (const m of ctx.members) {
    lines.push(formatMemberLine(m));
  }

  if (ctx.locks && ctx.locks.length > 0) {
    lines.push('');
    lines.push('Locked files:');
    for (const l of ctx.locks) {
      lines.push(formatLockLine(l));
    }
  }

  if (ctx.memories && ctx.memories.length > 0) {
    lines.push('');
    lines.push('Project knowledge:');
    for (const mem of ctx.memories) {
      lines.push(formatMemoryLine(mem));
    }
  }

  if (options.showInsights && ctx.members) {
    const insights = [];
    for (const m of ctx.members) {
      if (m.activity?.updated_at) {
        const mins = m.minutes_since_update != null
          ? m.minutes_since_update
          : (Date.now() - new Date(m.activity.updated_at).getTime()) / 60_000;
        if (mins > 15) {
          const stuckFile = m.activity?.files?.length > 0 ? m.activity.files[0] : 'a file';
          insights.push(`${m.handle} has been on ${stuckFile} for ${formatLockDuration(mins)} \u2014 may need help`);
        }
      }
    }
    if (insights.length > 0) {
      lines.push('');
      lines.push('Insights:');
      for (const insight of insights) {
        lines.push(`  ${insight}`);
      }
    }
  }

  return lines;
}
