// Shared primitives used across other schema files.
// Guards the UI layer against malformed backend data.

import { z } from 'zod';

// ── Shared primitives ───────────────────────────────

export const hostMetricSchema = z.object({
  host_tool: z.string(),
  joins: z.number().default(0),
});

export const surfaceMetricSchema = z.object({
  agent_surface: z.string(),
  joins: z.number().default(0),
});

export const modelMetricSchema = z.object({
  agent_model: z.string(),
  count: z.number().default(0),
});

export const memberSchema = z.object({
  agent_id: z.string(),
  handle: z.string(),
  status: z.string().default('unknown'),
  host_tool: z.string().default('unknown'),
  agent_surface: z.string().optional(),
  transport: z.string().nullable().optional(),
  agent_model: z.string().nullable().optional(),
  activity: z
    .object({
      files: z.array(z.string()).default([]),
      summary: z.string().optional(),
      updated_at: z.string().optional(),
    })
    .nullable()
    .optional(),
  color: z.string().nullable().optional(),
  session_minutes: z.number().nullable().optional(),
});

export const memorySchema = z.object({
  id: z.string(),
  text: z.string(),
  tags: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  handle: z.string().nullable().optional(),
  host_tool: z.string().nullable().optional(),
  agent_surface: z.string().nullable().optional(),
  agent_model: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  last_accessed_at: z.string().nullable().optional(),
});

export const memoryCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  color: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const lockSchema = z.object({
  file_path: z.string(),
  agent_id: z.string().optional(),
  handle: z.string().nullable().optional(),
  host_tool: z.string().nullable().optional(),
  agent_surface: z.string().nullable().optional(),
  minutes_held: z.number().nullable().optional(),
});

export const messageSchema = z
  .object({
    id: z.string().optional(),
    agent_id: z.string().nullable().optional(),
    handle: z.string().optional(),
    from_handle: z.string().optional(),
    host_tool: z.string().nullable().optional(),
    from_host_tool: z.string().nullable().optional(),
    from_tool: z.string().nullable().optional(),
    agent_surface: z.string().nullable().optional(),
    from_agent_surface: z.string().nullable().optional(),
    text: z.string(),
    created_at: z.string().optional(),
    target: z.string().nullable().optional(),
  })
  .transform((msg) => ({
    ...msg,
    handle: msg.handle || msg.from_handle || '',
    host_tool: msg.host_tool || msg.from_host_tool || msg.from_tool || null,
    agent_surface: msg.agent_surface || msg.from_agent_surface || null,
  }));

export const sessionSchema = z
  .object({
    id: z.string().optional(),
    agent_id: z.string().optional(),
    owner_handle: z.string().optional(),
    handle: z.string().optional(),
    framework: z.string().optional(),
    host_tool: z.string().default('unknown'),
    agent_surface: z.string().nullable().optional(),
    transport: z.string().nullable().optional(),
    agent_model: z.string().nullable().optional(),
    started_at: z.string(),
    ended_at: z.string().nullable().optional(),
    edit_count: z.number().default(0),
    files_touched: z.array(z.string()).default([]),
    conflicts_hit: z.number().default(0),
    memories_saved: z.number().default(0),
    duration_minutes: z.number().nullable().optional(),
    outcome: z.string().nullable().optional(),
    outcome_summary: z.string().nullable().optional(),
    outcome_tags: z.array(z.string()).default([]),
    lines_added: z.number().default(0),
    lines_removed: z.number().default(0),
    first_edit_at: z.string().nullable().optional(),
    got_stuck: z.preprocess((v) => v === 1 || v === true, z.boolean()).default(false),
    memories_searched: z.number().default(0),
    input_tokens: z.number().nullable().optional(),
    output_tokens: z.number().nullable().optional(),
  })
  .transform((session) => ({
    ...session,
    agent_id: session.agent_id || '',
    owner_handle: session.owner_handle || session.handle || 'Agent',
    handle: session.handle || session.owner_handle || 'Agent',
  }));

export const conflictSchema = z.object({
  file: z.string(),
  agents: z.array(z.string()).default([]),
});

export const teamSchema = z.object({
  team_id: z.string(),
  team_name: z.string().optional(),
  joined_at: z.string().optional(),
});

export const userSchema = z.object({
  handle: z.string(),
  color: z.string(),
  created_at: z.string().optional(),
  github_id: z.string().nullable().optional(),
  github_login: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});

export const wsTicketSchema = z.object({
  ticket: z.string(),
  expires_at: z.string().optional(),
});

export const toolCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  featured: z.boolean().optional(),
  installCmd: z.string().nullable().optional(),
  mcp_support: z.boolean().optional(),
});

export const toolDirectoryEvaluationSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  verdict: z.string().optional(),
  tagline: z.string().optional(),
  integration_tier: z.string().optional(),
  mcp_support: z.union([z.boolean(), z.string()]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ── Inferred types from schemas ────────────────────

export type HostMetric = z.infer<typeof hostMetricSchema>;
export type SurfaceMetric = z.infer<typeof surfaceMetricSchema>;
export type ModelMetric = z.infer<typeof modelMetricSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Memory = z.infer<typeof memorySchema>;
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;
export type Lock = z.infer<typeof lockSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Conflict = z.infer<typeof conflictSchema>;
export type Team = z.infer<typeof teamSchema>;
export type User = z.infer<typeof userSchema>;
export type WsTicket = z.infer<typeof wsTicketSchema>;
export type ToolCatalogEntry = z.infer<typeof toolCatalogEntrySchema>;
export type ToolDirectoryEvaluation = z.infer<typeof toolDirectoryEvaluationSchema>;

// ── Team context response ───────────────────────────

const daemonStatusSchema = z
  .object({
    connected: z.boolean().default(false),
    available_tools: z.array(z.string()).default([]),
  })
  .default({ connected: false, available_tools: [] });

export type DaemonStatus = z.infer<typeof daemonStatusSchema>;

export const teamContextSchema = z
  .object({
    members: z.array(memberSchema).catch([]),
    memories: z.array(memorySchema).catch([]),
    memory_categories: z.array(memoryCategorySchema).catch([]),
    locks: z.array(lockSchema).catch([]),
    messages: z.array(messageSchema).catch([]),
    recentSessions: z.array(sessionSchema).catch([]),
    sessions: z.array(sessionSchema).catch([]),
    conflicts: z.array(conflictSchema).catch([]),
    tools_configured: z.array(hostMetricSchema).catch([]),
    hosts_configured: z.array(hostMetricSchema).catch([]),
    surfaces_seen: z.array(surfaceMetricSchema).catch([]),
    models_seen: z.array(modelMetricSchema).catch([]),
    usage: z.record(z.number()).catch({}),
    daemon: daemonStatusSchema,
  })
  .transform((context) => ({
    ...context,
    recentSessions: context.recentSessions.length > 0 ? context.recentSessions : context.sessions,
  }));

export type TeamContext = z.infer<typeof teamContextSchema>;

// ── Dashboard summary response ──────────────────────

const activeMemberSchema = z.object({
  agent_id: z.string(),
  handle: z.string().default('unknown'),
  host_tool: z.string().default('unknown'),
  agent_surface: z.string().nullable().default(null),
  files: z.array(z.string()).default([]),
  summary: z.string().nullable().default(null),
  session_minutes: z.number().nullable().default(null),
});

export type ActiveMember = z.infer<typeof activeMemberSchema>;

const teamSummarySchema = z.object({
  team_id: z.string(),
  team_name: z.string().optional(),
  active_agents: z.number().default(0),
  memory_count: z.number().default(0),
  conflict_count: z.number().default(0),
  total_members: z.number().default(0),
  live_sessions: z.number().default(0),
  recent_sessions_24h: z.number().default(0),
  active_members: z.array(activeMemberSchema).default([]),
  hosts_configured: z.array(hostMetricSchema).default([]),
  surfaces_seen: z.array(surfaceMetricSchema).default([]),
  models_seen: z.array(modelMetricSchema).default([]),
  usage: z.record(z.number()).default({}),
});

export type TeamSummary = z.infer<typeof teamSummarySchema>;

export const dashboardSummarySchema = z.object({
  teams: z.array(teamSummarySchema).default([]),
  degraded: z.boolean().default(false),
  failed_teams: z
    .array(z.object({ team_id: z.string().optional(), team_name: z.string().optional() }))
    .default([]),
  truncated: z.boolean().default(false),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const userTeamsSchema = z.object({
  teams: z.array(teamSchema).default([]),
});

export type UserTeams = z.infer<typeof userTeamsSchema>;

export const userProfileSchema = userSchema;
export type UserProfile = z.infer<typeof userProfileSchema>;

export const webSocketTicketSchema = wsTicketSchema;
export type WebSocketTicket = z.infer<typeof webSocketTicketSchema>;

export const toolCatalogSchema = z.object({
  tools: z.array(toolCatalogEntrySchema).default([]),
  categories: z.record(z.string()).default({}),
});

export type ToolCatalog = z.infer<typeof toolCatalogSchema>;

export const toolDirectorySchema = z.object({
  evaluations: z.array(toolDirectoryEvaluationSchema).default([]),
  categories: z.record(z.string()).default({}),
});

export type ToolDirectory = z.infer<typeof toolDirectorySchema>;

// ── Edit history (per-edit audit log) ──────────────────

const editEntrySchema = z.object({
  id: z.string(),
  session_id: z.string(),
  handle: z.string(),
  host_tool: z.string().default('unknown'),
  file_path: z.string(),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
  created_at: z.string(),
});

export const editHistorySchema = z.object({
  ok: z.literal(true),
  edits: z.array(editEntrySchema).default([]),
});

export type EditEntry = z.infer<typeof editEntrySchema>;
export type EditHistory = z.infer<typeof editHistorySchema>;

// ── Factory functions ──────────────────────────────

export function createEmptyTeamContext(): TeamContext {
  return {
    members: [],
    memories: [],
    memory_categories: [],
    locks: [],
    messages: [],
    recentSessions: [],
    sessions: [],
    conflicts: [],
    tools_configured: [],
    hosts_configured: [],
    surfaces_seen: [],
    models_seen: [],
    usage: {},
    daemon: { connected: false, available_tools: [] },
  };
}

export function createEmptyDashboardSummary(): DashboardSummary {
  return {
    teams: [],
    degraded: true,
    failed_teams: [],
    truncated: false,
  };
}

export function createEmptyUserTeams(): UserTeams {
  return { teams: [] };
}

export function createEmptyToolCatalog(): ToolCatalog {
  return { tools: [], categories: {} };
}

export function createEmptyToolDirectory(): ToolDirectory {
  return { evaluations: [], categories: {} };
}

export function createEmptyEditHistory(): EditHistory {
  return { ok: true, edits: [] };
}
