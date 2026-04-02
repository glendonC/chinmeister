// Runtime validation schemas for critical API responses.
// Guards the UI layer against malformed backend data — if the shape
// changes server-side, the dashboard degrades with a warning instead
// of crashing with an opaque TypeError deep in a component.
//
// Philosophy: permissive parsing (coerce/default where safe), strict
// on structural fields the UI actually destructures. Fields the UI
// doesn't touch are passed through unchanged.

import { z } from 'zod';

// ── Shared primitives ───────────────────────────────

const memberSchema = z
  .object({
    agent_id: z.string(),
    handle: z.string(),
    status: z.string().default('unknown'),
    tool: z.string().optional(),
    host_tool: z.string().optional(),
    agent_surface: z.string().optional(),
    activity: z
      .object({
        files: z.array(z.string()).default([]),
        summary: z.string().optional(),
        updated_at: z.string().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const memorySchema = z
  .object({
    id: z.string(),
    text: z.string(),
    tags: z.array(z.string()).default([]),
    source_handle: z.string().optional(),
  })
  .passthrough();

const lockSchema = z
  .object({
    file_path: z.string(),
    owner_handle: z.string().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    text: z.string(),
    from_handle: z.string(),
    created_at: z.string().optional(),
  })
  .passthrough();

const sessionSchema = z
  .object({
    agent_id: z.string().optional(),
    started_at: z.string().optional(),
    ended_at: z.string().nullable().optional(),
  })
  .passthrough();

// ── Team context response ───────────────────────────

export const teamContextSchema = z
  .object({
    members: z.array(memberSchema).default([]),
    memories: z.array(memorySchema).default([]),
    locks: z.array(lockSchema).default([]),
    messages: z.array(messageSchema).default([]),
    sessions: z.array(sessionSchema).default([]),
    conflicts: z.array(z.any()).default([]),
  })
  .passthrough();

// ── Dashboard summary response ──────────────────────

const teamSummarySchema = z
  .object({
    team_id: z.string(),
    team_name: z.string().optional(),
    active_agents: z.number().default(0),
    memory_count: z.number().default(0),
  })
  .passthrough();

export const dashboardSummarySchema = z
  .object({
    teams: z.array(teamSummarySchema).default([]),
    degraded: z.boolean().default(false),
    failed_teams: z.array(z.any()).default([]),
    truncated: z.boolean().default(false),
  })
  .passthrough();

// ── Safe parse wrapper ──────────────────────────────

/**
 * Validate an API response against a schema. On success, returns the parsed
 * (and defaulted) data. On failure, logs a warning and returns the raw data
 * unchanged — the UI may still work if the mismatch is minor.
 *
 * @param {z.ZodSchema} schema
 * @param {*} data - Raw API response
 * @param {string} label - For log identification
 * @returns {*} Parsed data or raw fallback
 */
export function validateResponse(schema, data, label) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  console.warn(
    `[chinwag] API response validation warning (${label}):`,
    result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  );
  return data;
}
