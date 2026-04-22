/**
 * Dashboard aggregates, team context, authentication, and user types.
 */

import { z } from 'zod';

import {
  teamMemberSchema,
  teamConflictSchema,
  teamLockSchema,
  teamMemorySchema,
  teamMessageSchema,
  teamSessionSchema,
} from './team.js';

export const hostJoinMetricSchema = z.object({
  host_tool: z.string(),
  joins: z.number(),
});
export type HostJoinMetric = z.infer<typeof hostJoinMetricSchema>;

export const toolJoinMetricSchema = z.object({
  tool: z.string(),
  joins: z.number(),
});
export type ToolJoinMetric = z.infer<typeof toolJoinMetricSchema>;

export const surfaceJoinMetricSchema = z.object({
  agent_surface: z.string(),
  joins: z.number(),
});
export type SurfaceJoinMetric = z.infer<typeof surfaceJoinMetricSchema>;

export const modelMetricSchema = z.object({
  agent_model: z.string(),
  count: z.number(),
});
export type ModelMetric = z.infer<typeof modelMetricSchema>;

export const teamContextSchema = z.object({
  members: z.array(teamMemberSchema),
  conflicts: z.array(teamConflictSchema),
  locks: z.array(teamLockSchema),
  memories: z.array(teamMemorySchema),
  messages: z.array(teamMessageSchema),
  recentSessions: z.array(teamSessionSchema),
  sessions: z.array(teamSessionSchema).optional(),
  tools_configured: z.array(toolJoinMetricSchema).optional(),
  hosts_configured: z.array(hostJoinMetricSchema).optional(),
  surfaces_seen: z.array(surfaceJoinMetricSchema).optional(),
  models_seen: z.array(modelMetricSchema).optional(),
  usage: z.record(z.string(), z.number()).optional(),
});
export type TeamContext = z.infer<typeof teamContextSchema>;

export const dashboardTeamSummarySchema = z.object({
  team_id: z.string(),
  team_name: z.string().optional(),
  active_agents: z.number(),
  memory_count: z.number(),
  /** Memory count as of 7 days ago. Pairs with `memory_count` to render the
   *  growth delta on the projects widget. Optional: older worker builds and
   *  legacy fixtures may omit it; renderer should suppress the delta when
   *  this is absent rather than treating the previous count as zero. */
  memory_count_previous: z.number().optional(),
  conflict_count: z.number().optional(),
  /** Sum of session conflicts_hit over the last 7 days. Distinct from
   *  `conflict_count` (live activity-overlap snapshot). */
  conflicts_7d: z.number().optional(),
  /** Sum of session conflicts_hit over the 14d-to-7d window. Pairs with
   *  `conflicts_7d` for a period delta. */
  conflicts_7d_previous: z.number().optional(),
  total_members: z.number().optional(),
  live_sessions: z.number().optional(),
  recent_sessions_24h: z.number().optional(),
  /** Daily session counts for the last 7 days, oldest → newest, always 7
   *  entries. Sparkline source for the projects widget activity column. */
  daily_sessions_7d: z.array(z.number()).optional(),
  tools_configured: z.array(toolJoinMetricSchema).optional(),
  hosts_configured: z.array(hostJoinMetricSchema).optional(),
  surfaces_seen: z.array(surfaceJoinMetricSchema).optional(),
  models_seen: z.array(modelMetricSchema).optional(),
  usage: z.record(z.string(), z.number()).optional(),
});
export type DashboardTeamSummary = z.infer<typeof dashboardTeamSummarySchema>;

export const dashboardSummarySchema = z.object({
  teams: z.array(dashboardTeamSummarySchema),
  degraded: z.boolean(),
  failed_teams: z.array(z.record(z.string(), z.unknown())),
  truncated: z.boolean(),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const authenticatedUserSchema = z.object({
  handle: z.string(),
  color: z.string(),
  created_at: z.string(),
  /**
   * Partial BudgetConfig. The server re-validates on write via parseBudgetConfig
   * so clients may receive an empty object or null if no override is set.
   */
  budgets: z.record(z.unknown()).nullable().optional(),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const userTeamSchema = z.object({
  team_id: z.string(),
  team_name: z.string(),
  joined_at: z.string().optional(),
});
export type UserTeam = z.infer<typeof userTeamSchema>;

export const userTeamsResponseSchema = z.object({
  teams: z.array(userTeamSchema),
});
export type UserTeamsResponse = z.infer<typeof userTeamsResponseSchema>;

export const webSocketTicketResponseSchema = z.object({
  ticket: z.string(),
  expires_at: z.string().optional(),
});
export type WebSocketTicketResponse = z.infer<typeof webSocketTicketResponseSchema>;
