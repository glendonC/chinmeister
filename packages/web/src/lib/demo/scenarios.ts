// Demo scenario registry. Each scenario returns a { analytics, conversation,
// live } triple. Scenarios build from the healthy baseline and override only
// the fields that change - this keeps the surface area auditable and
// prevents "shadow baseline" drift when one widget needs a tweak.
//
// Adding a scenario: pick a specific question a widget asks (e.g. "what
// does cost-per-edit look like when pricing is stale?"), pick the minimum
// fields that answer it, and write an override. Do not clone the whole
// baseline; use the spread helper.

import type {
  UserAnalytics,
  ConversationAnalytics,
  UserProfile,
  UserTeams,
  DashboardSummary,
  TeamContext,
} from '../apiSchemas.js';
import { createBaselineAnalytics, DEFAULT_PERIOD_DAYS } from './baseline.js';
import { createBaselineConversation } from './conversation.js';
import { createBaselineLive, createEmptyLive, type LiveDemoData } from './live.js';
import { createBaselineReports, createEmptyReports, type ReportsDemoData } from './reports.js';
import { createBaselineMe, createBaselineTeams, createEmptyTeams } from './me.js';
import {
  createBaselineDashboard,
  createEmptyDashboard,
  createBaselineTeamContexts,
  createEmptyTeamContexts,
} from './dashboard.js';
import {
  createBaselineGlobalRank,
  createEmptyGlobalRank,
  createBaselineGlobalStats,
  createEmptyGlobalStats,
  createBaselineSessions,
  createEmptySessions,
  type SessionsDemoData,
} from './global.js';
import type { GlobalRank } from '../../hooks/useGlobalRank.js';
import type { GlobalStats } from '../../hooks/useGlobalStats.js';
import { createEmptyAnalytics, createEmptyConversation } from './empty.js';

export type DemoScenarioId =
  | 'healthy'
  | 'empty'
  | 'solo-cc'
  | 'solo-no-hooks'
  | 'mixed-capture'
  | 'stale-pricing'
  | 'models-without-pricing'
  | 'first-period'
  | 'negative-delta'
  | 'no-live-agents'
  | 'team-conflicts'
  | 'failure-heavy'
  | 'stuck-heavy'
  | 'high-cost'
  | 'memory-stale'
  | 'memory-concentrated';

// Top-level grouping. Drives the popover headings + the /demo browse page
// category filter. Pick one per scenario; if a scenario fits two equally,
// pick the one a dev would search first.
export type DemoCategory =
  | 'baseline'
  | 'empty-states'
  | 'coverage'
  | 'pricing'
  | 'deltas'
  | 'coordination'
  | 'outcomes'
  | 'memory';

// Independent variables a scenario varies vs the healthy baseline. Used for
// column chips in the /demo table and dimension filters in the popover.
// "I want to test X" → filter by the dimension that varies X.
export type DemoDimension =
  | 'team-size' // solo vs team
  | 'capture-depth' // hooks / tokens / conversation present
  | 'pricing' // cost data fresh + complete
  | 'deltas' // previous-period comparison usable
  | 'coordination' // conflicts, retries, overlap
  | 'memory' // memory aging, concentration, hit rate
  | 'live-presence' // live agents present
  | 'outcomes'; // outcome mix (completed/abandoned/failed/stuck)

// Routes that meaningfully change vs the healthy baseline. The picker uses
// this to scope itself to scenarios that actually affect the screen the dev
// is on. "All" means a baseline-comparable change is visible everywhere.
export type DemoView = 'overview' | 'reports' | 'tools' | 'project' | 'global';

export interface DemoData {
  analytics: UserAnalytics;
  conversation: ConversationAnalytics;
  live: LiveDemoData;
  reports: ReportsDemoData;
  me: UserProfile;
  teams: UserTeams;
  dashboard: DashboardSummary;
  teamContexts: Record<string, TeamContext>;
  globalRank: GlobalRank;
  globalStats: GlobalStats;
  sessions: SessionsDemoData;
}

export interface DemoScenario {
  id: DemoScenarioId;
  label: string;
  category: DemoCategory;
  /** What this scenario varies vs the healthy baseline. */
  dimensions: DemoDimension[];
  /** Routes whose UI meaningfully changes under this scenario. */
  views: DemoView[];
  /** One-line summary in plain English. Replaces widget-jargon descriptions. */
  summary: string;
  /** What a dev should look for when this scenario is active. One sentence. */
  whatToCheck: string;
  build: () => DemoData;
}

// ── Helpers for the non-Overview slices ─────────────────────────────
//
// Most scenarios share the same identity/teams/dashboard/global frames -
// the differentiating story lives in analytics/conversation/live. These
// helpers keep that story authored in one place per builder instead of
// repeating 7 fields per scenario. Solo scenarios narrow to one team;
// empty/no-hooks zero everything except `me` (the user is still logged in).

type DemoFrame = Pick<
  DemoData,
  'me' | 'teams' | 'dashboard' | 'teamContexts' | 'globalRank' | 'globalStats' | 'sessions'
>;

function baselineFrame(): DemoFrame {
  return {
    me: createBaselineMe(),
    teams: createBaselineTeams(),
    dashboard: createBaselineDashboard(),
    teamContexts: createBaselineTeamContexts(),
    globalRank: createBaselineGlobalRank(),
    globalStats: createBaselineGlobalStats(),
    sessions: createBaselineSessions(),
  };
}

function emptyFrame(): DemoFrame {
  return {
    me: createBaselineMe(), // user is still logged in even when nothing has happened
    teams: createEmptyTeams(),
    dashboard: createEmptyDashboard(),
    teamContexts: createEmptyTeamContexts(),
    globalRank: createEmptyGlobalRank(),
    globalStats: createEmptyGlobalStats(),
    sessions: createEmptySessions(),
  };
}

function singleTeamFrame(teamId = 'team-frontend'): DemoFrame {
  const base = baselineFrame();
  const team = base.teams.teams.find((t) => t.team_id === teamId);
  const teamCtx = base.teamContexts[teamId];
  return {
    ...base,
    teams: { teams: team ? [team] : [] },
    dashboard: {
      ...base.dashboard,
      teams: base.dashboard.teams.filter((t) => t.team_id === teamId),
    },
    teamContexts: teamCtx ? { [teamId]: teamCtx } : {},
    sessions: {
      ...base.sessions,
      sessions: base.sessions.sessions.filter((s) => s.team_id === teamId),
    },
  };
}

// ── Scenario builders ───────────────────────────────────────────────

// Healthy: baseline, unchanged.
function healthy(): DemoData {
  return {
    analytics: createBaselineAnalytics(),
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Empty: valid UserAnalytics shape with zero sessions everywhere. Exercises
// every empty-state branch in the widget tree simultaneously. Shares its
// shape source with live-mode hooks via lib/demo/empty.ts so the canonical
// "no data" shape stays in one place.
function empty(): DemoData {
  const analytics = createEmptyAnalytics();
  // Empty scenario keeps teams_included at 1: a logged-in user with one
  // team that simply has no activity yet, not a no-team account.
  analytics.teams_included = 1;
  return {
    analytics,
    conversation: createEmptyConversation(),
    live: createEmptyLive(),
    reports: createEmptyReports(),
    ...emptyFrame(),
  };
}

// Solo on Claude Code: one handle, one tool, full capture. Exercises the
// "requires 2+ agents" gating on conflict/team/handoff widgets without
// wiping the deep-capture stats that make CC the richest single-tool demo.
function soloCC(): DemoData {
  const base = createBaselineAnalytics();
  const analytics: UserAnalytics = {
    ...base,
    teams_included: 1,
    tool_distribution: base.tool_distribution.filter((t) => t.host_tool === 'claude-code'),
    tool_comparison: base.tool_comparison.filter((t) => t.host_tool === 'claude-code'),
    tool_outcomes: base.tool_outcomes.filter((t) => t.host_tool === 'claude-code'),
    tool_daily: base.tool_daily.filter((t) => t.host_tool === 'claude-code'),
    tool_work_type: base.tool_work_type.filter((t) => t.host_tool === 'claude-code'),
    tool_handoffs: [],
    concurrent_edits: [],
    file_overlap: { total_files: 0, overlapping_files: 0 },
    conflict_correlation: [],
    conflict_stats: { blocked_period: 0, found_period: 0, daily_blocked: [] },
    retry_patterns: [],
    member_analytics: base.member_analytics.slice(0, 1),
    member_analytics_total: 1,
    member_daily_lines: base.member_daily_lines.filter(
      (m) => m.handle === base.member_analytics[0]!.handle,
    ),
    per_project_velocity: base.per_project_velocity.slice(0, 1),
    per_project_lines: base.per_project_lines.filter(
      (p) => p.team_id === base.per_project_velocity[0]!.team_id,
    ),
    data_coverage: {
      tools_reporting: ['claude-code'],
      tools_without_data: [],
      coverage_rate: 1,
      capabilities_available: [
        'hooks',
        'tokenUsage',
        'conversationLogs',
        'toolCallLogs',
        'commitTracking',
      ],
      capabilities_missing: [],
    },
  };
  // Conversation data shrinks to just Claude Code's share.
  const baseConv = createBaselineConversation();
  const scale = 0.45; // CC's rough share of convo-capable sessions
  const conversation: ConversationAnalytics = {
    ...baseConv,
    total_messages: Math.round(baseConv.total_messages * scale),
    user_messages: Math.round(baseConv.user_messages * scale),
    assistant_messages: Math.round(baseConv.assistant_messages * scale),
    sessions_with_conversations: Math.round(baseConv.sessions_with_conversations * scale),
    sentiment_distribution: baseConv.sentiment_distribution
      .map((s) => ({
        ...s,
        count: Math.round(s.count * scale),
      }))
      .filter((s) => s.count > 0),
    topic_distribution: baseConv.topic_distribution
      .map((t) => ({
        ...t,
        count: Math.round(t.count * scale),
      }))
      .filter((t) => t.count > 0),
    sentiment_outcome_correlation: baseConv.sentiment_outcome_correlation
      .map((s) => ({
        ...s,
        sessions: Math.round(s.sessions * scale),
        completed: Math.round(s.completed * scale),
        abandoned: Math.round(s.abandoned * scale),
        failed: Math.round(s.failed * scale),
      }))
      .filter((s) => s.sessions > 0),
    tool_coverage: { supported_tools: ['claude-code'], unsupported_tools: [] },
  };
  const baseLive = createBaselineLive();
  const live: LiveDemoData = {
    liveAgents: baseLive.liveAgents
      .filter((a) => a.host_tool === 'claude-code' && a.handle === 'glendon')
      .slice(0, 1),
    locks: baseLive.locks
      .filter((l) => l.host_tool === 'claude-code' && l.handle === 'glendon')
      .slice(0, 1),
    summaries: baseLive.summaries
      .slice(0, 1)
      .map((s) => ({ ...s, active_agents: 1, conflict_count: 0 })),
  };
  return {
    analytics,
    conversation,
    live,
    reports: createBaselineReports(),
    ...singleTeamFrame('team-frontend'),
  };
}

// Solo on a non-hook MCP tool (JetBrains). No hooks, no token data, no
// conversation capture, no tool calls, no commit tracking. The deep-capture
// widgets all fall through to coverage notes explaining which tool would
// provide the data.
function soloNoHooks(): DemoData {
  const base = soloCC().analytics;
  const analytics: UserAnalytics = {
    ...base,
    tool_distribution: [
      {
        host_tool: 'jetbrains',
        sessions: base.completion_summary.total_sessions,
        edits: base.tool_distribution[0]?.edits ?? 0,
      },
    ],
    tool_comparison: base.tool_comparison.map((t) => ({ ...t, host_tool: 'jetbrains' })),
    tool_outcomes: base.tool_outcomes.map((t) => ({ ...t, host_tool: 'jetbrains' })),
    tool_daily: base.tool_daily.map((t) => ({ ...t, host_tool: 'jetbrains' })),
    tool_work_type: base.tool_work_type.map((t) => ({ ...t, host_tool: 'jetbrains' })),
    model_outcomes: [],
    token_usage: {
      ...base.token_usage,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_read_tokens: 0,
      total_cache_creation_tokens: 0,
      avg_input_per_session: 0,
      avg_output_per_session: 0,
      sessions_with_token_data: 0,
      sessions_without_token_data: base.completion_summary.total_sessions,
      total_edits_in_token_sessions: 0,
      total_estimated_cost_usd: 0,
      cost_per_edit: null,
      cache_hit_rate: null,
      by_model: [],
      by_tool: [],
    },
    tool_call_stats: {
      ...base.tool_call_stats,
      total_calls: 0,
      total_errors: 0,
      error_rate: 0,
      one_shot_rate: 0,
      one_shot_sessions: 0,
      research_to_edit_ratio: 0,
      calls_per_session: 0,
      frequency: [],
      error_patterns: [],
      hourly_activity: [],
    },
    commit_stats: {
      total_commits: 0,
      commits_per_session: 0,
      sessions_with_commits: 0,
      avg_time_to_first_commit_min: null,
      by_tool: [],
      daily_commits: base.commit_stats.daily_commits.map((d) => ({ ...d, commits: 0 })),
      outcome_correlation: [],
      commit_edit_ratio: [],
    },
    daily_trends: base.daily_trends.map((d) => ({ ...d, cost: null, cost_per_edit: null })),
    period_comparison: {
      ...base.period_comparison,
      current: {
        ...base.period_comparison.current,
        total_estimated_cost_usd: null,
        total_edits_in_token_sessions: 0,
        cost_per_edit: null,
      },
      previous: base.period_comparison.previous
        ? {
            ...base.period_comparison.previous,
            total_estimated_cost_usd: null,
            total_edits_in_token_sessions: 0,
            cost_per_edit: null,
          }
        : null,
    },
    data_coverage: {
      tools_reporting: ['jetbrains'],
      tools_without_data: [],
      coverage_rate: 1,
      capabilities_available: [],
      capabilities_missing: [
        'hooks',
        'tokenUsage',
        'conversationLogs',
        'toolCallLogs',
        'commitTracking',
      ],
    },
  };
  const conversation: ConversationAnalytics = {
    ok: true,
    period_days: DEFAULT_PERIOD_DAYS,
    total_messages: 0,
    user_messages: 0,
    assistant_messages: 0,
    sentiment_distribution: [],
    topic_distribution: [],
    sentiment_outcome_correlation: [],
    sessions_with_conversations: 0,
    tool_coverage: { supported_tools: [], unsupported_tools: ['jetbrains'] },
  };
  return {
    analytics,
    conversation,
    live: {
      liveAgents: [],
      locks: [],
      summaries: [
        {
          team_id: 'team-frontend',
          team_name: 'frontend',
          active_agents: 1,
          memory_count: 6,
          recent_sessions_24h: 4,
          conflict_count: 0,
          hosts_configured: [{ host_tool: 'jetbrains', joins: 1 }],
          surfaces_seen: [],
          models_seen: [],
          usage: {},
        },
      ],
    },
    reports: createEmptyReports(),
    ...singleTeamFrame('team-frontend'),
  };
}

// Stale pricing: snapshot is >7 days old, cost fields null. Widgets should
// render "--" with the "Pricing refresh pending" coverage note.
function stalePricing(): DemoData {
  const base = createBaselineAnalytics();
  return {
    analytics: {
      ...base,
      token_usage: {
        ...base.token_usage,
        pricing_is_stale: true,
        pricing_refreshed_at: new Date(Date.now() - 9 * 86400_000).toISOString(),
        total_estimated_cost_usd: 0,
        cost_per_edit: null,
        by_model: base.token_usage.by_model.map((m) => ({ ...m, estimated_cost_usd: null })),
      },
      daily_trends: base.daily_trends.map((d) => ({ ...d, cost: null, cost_per_edit: null })),
      period_comparison: {
        ...base.period_comparison,
        current: {
          ...base.period_comparison.current,
          total_estimated_cost_usd: null,
          cost_per_edit: null,
        },
        previous: base.period_comparison.previous
          ? {
              ...base.period_comparison.previous,
              total_estimated_cost_usd: null,
              cost_per_edit: null,
            }
          : null,
      },
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Models without pricing: the LiteLLM snapshot is fresh but doesn't know
// some of the models we observed. Coverage note names which model.
function modelsWithoutPricing(): DemoData {
  const base = createBaselineAnalytics();
  const byModel = base.token_usage.by_model.map((m, i) =>
    i < 2 ? m : { ...m, estimated_cost_usd: null },
  );
  const priced = byModel.filter((m) => m.estimated_cost_usd != null);
  const partialCost = priced.reduce((s, m) => s + (m.estimated_cost_usd ?? 0), 0);
  const missing = byModel.filter((m) => m.estimated_cost_usd == null).map((m) => m.agent_model);
  return {
    analytics: {
      ...base,
      token_usage: {
        ...base.token_usage,
        total_estimated_cost_usd: Math.round(partialCost * 100) / 100,
        by_model: byModel,
        models_without_pricing: missing,
        models_without_pricing_total: missing.length,
      },
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// First period: no previous window to compare against. Every delta pill
// suppresses (InlineDelta returns null when previous is null/≤0).
function firstPeriod(): DemoData {
  const base = createBaselineAnalytics();
  return {
    analytics: {
      ...base,
      completion_summary: { ...base.completion_summary, prev_completion_rate: null },
      period_comparison: { ...base.period_comparison, previous: null },
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Team with active conflicts: more collisions, higher retry volume, larger
// file_overlap and concurrent_edits lists. Demonstrates the coordination
// story end-to-end: live-conflicts → retry patterns → file overlap.
function teamConflicts(): DemoData {
  const base = createBaselineAnalytics();
  return {
    analytics: {
      ...base,
      conflict_stats: { blocked_period: 18, found_period: 47, daily_blocked: [] },
      file_overlap: { total_files: base.file_overlap.total_files, overlapping_files: 42 },
      retry_patterns: [
        ...base.retry_patterns,
        {
          file: 'packages/web/src/views/OverviewView/OverviewView.tsx',
          attempts: 9,
          agents: 4,
          tools: ['claude-code', 'cursor', 'windsurf'],
          final_outcome: 'completed',
          resolved: true,
        },
        {
          file: 'packages/worker/src/routes/team/membership.ts',
          attempts: 7,
          agents: 3,
          tools: ['claude-code', 'aider'],
          final_outcome: 'failed',
          resolved: false,
        },
        {
          file: 'packages/cli/lib/dashboard/App.tsx',
          attempts: 6,
          agents: 2,
          tools: ['cursor', 'claude-code'],
          final_outcome: 'abandoned',
          resolved: false,
        },
      ],
      concurrent_edits: [
        ...base.concurrent_edits,
        { file: 'packages/web/src/views/OverviewView/OverviewView.tsx', agents: 4, edit_count: 28 },
        { file: 'packages/worker/src/routes/team/membership.ts', agents: 3, edit_count: 19 },
      ],
      conflict_correlation: [
        { bucket: 'with conflicts', sessions: 68, completed: 36, completion_rate: 53 },
        {
          bucket: 'without',
          sessions: base.completion_summary.total_sessions - 68,
          completed: Math.round((base.completion_summary.total_sessions - 68) * 0.79),
          completion_rate: 79,
        },
      ],
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Negative delta: period got worse. Flips the previous-period numbers so
// the enriched stat cards render red downward arrows. Stuckness, cost,
// completion rate all move the wrong way.
function negativeDelta(): DemoData {
  const base = createBaselineAnalytics();
  const curr = base.period_comparison.current;
  return {
    analytics: {
      ...base,
      period_comparison: {
        current: curr,
        previous: {
          completion_rate: Math.min(100, curr.completion_rate + 8),
          avg_duration_min: Math.max(1, curr.avg_duration_min - 4),
          stuckness_rate: Math.max(0, curr.stuckness_rate - 6),
          memory_hit_rate: Math.min(100, curr.memory_hit_rate + 12),
          edit_velocity: curr.edit_velocity + 0.6,
          total_sessions: Math.round(curr.total_sessions * 1.18),
          total_estimated_cost_usd:
            curr.total_estimated_cost_usd != null
              ? Math.round(curr.total_estimated_cost_usd * 0.78 * 100) / 100
              : null,
          total_edits_in_token_sessions: Math.round(curr.total_edits_in_token_sessions * 1.12),
          cost_per_edit:
            curr.cost_per_edit != null
              ? Math.round(curr.cost_per_edit * 0.72 * 10_000) / 10_000
              : null,
          // Previous window was healthier across the board, so one-shot and
          // qualified-hour completion both sit above the current values.
          one_shot_rate: curr.one_shot_rate != null ? Math.min(1, curr.one_shot_rate + 0.09) : 0.78,
          qualified_hour_completion_median:
            curr.qualified_hour_completion_median != null
              ? Math.min(1, curr.qualified_hour_completion_median + 0.07)
              : 0.81,
        },
      },
      completion_summary: {
        ...base.completion_summary,
        prev_completion_rate: Math.min(100, curr.completion_rate + 8),
      },
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// No live agents: analytics populated, live presence empty. Exercises
// live-agents / live-conflicts / files-in-play empty states without
// hiding everything else.
function noLiveAgents(): DemoData {
  return {
    analytics: createBaselineAnalytics(),
    conversation: createBaselineConversation(),
    live: createEmptyLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Memory stale: aging skewed to >90d, stale count high. Exercises the
// freshness-warn and stale-tinted paths in the memory tile + freshness
// hero. Other categories unchanged so we can see memory-only severity.
function memoryStale(): DemoData {
  const base = createBaselineAnalytics();
  const totalMemories = 56;
  return {
    analytics: {
      ...base,
      memory_usage: {
        ...base.memory_usage,
        total_memories: totalMemories,
        stale_memories: 28,
        avg_memory_age_days: 118,
        memories_created_period: 2,
      },
      memory_aging: { recent_7d: 1, recent_30d: 4, recent_90d: 12, older: 39 },
      memory_supersession: {
        invalidated_period: 0,
        merged_period: 1,
        pending_proposals: 8,
      },
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Memory concentrated: single-author directories dominate; severe-warn
// fills (>=80% single-author share) on every row. Exercises the warn
// tint on the concentration list and the high-share severity branch in
// the authorship detail panel.
function memoryConcentrated(): DemoData {
  const base = createBaselineAnalytics();
  return {
    analytics: {
      ...base,
      memory_single_author_directories: [
        {
          directory: 'packages/worker/dos/team',
          single_author_count: 11,
          total_count: 12,
        },
        {
          directory: 'packages/web/src/widgets/bodies',
          single_author_count: 9,
          total_count: 10,
        },
        {
          directory: 'packages/mcp/lib/tools',
          single_author_count: 7,
          total_count: 8,
        },
        {
          directory: 'packages/cli/lib/commands',
          single_author_count: 6,
          total_count: 7,
        },
        {
          directory: 'packages/shared/contracts',
          single_author_count: 5,
          total_count: 6,
        },
        {
          directory: '.internal',
          single_author_count: 4,
          total_count: 4,
        },
      ],
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Mixed capture: realistic team where some tools have hooks and some don't.
// The default healthy baseline assumes every tool reports full capability;
// in real teams most have at least one MCP-only tool (JetBrains, Amazon Q,
// VS Code Copilot) producing only session metadata. Coverage notes fire
// across cost, conversation, and tool-call widgets.
function mixedCapture(): DemoData {
  const base = createBaselineAnalytics();
  return {
    analytics: {
      ...base,
      data_coverage: {
        tools_reporting: ['claude-code', 'cursor', 'aider', 'cline', 'windsurf'],
        tools_without_data: ['jetbrains'],
        coverage_rate: 5 / 6,
        capabilities_available: ['hooks', 'tokenUsage', 'conversationLogs', 'toolCallLogs'],
        capabilities_missing: ['commitTracking'],
      },
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Failure heavy: outcome mix tilts hard toward abandoned/failed, completion
// rate drops, retry patterns spike. Lights up the Failures report story
// (and the failed-files list inside it once the runner is wired).
function failureHeavy(): DemoData {
  const base = createBaselineAnalytics();
  const totalSessions = base.completion_summary.total_sessions;
  // Re-target the outcome mix: 38% completed, 28% abandoned, 28% failed,
  // 6% unknown. Keeps the math internally consistent without rebuilding
  // the whole ledger.
  const completed = Math.round(totalSessions * 0.38);
  const abandoned = Math.round(totalSessions * 0.28);
  const failed = Math.round(totalSessions * 0.28);
  const unknown = totalSessions - completed - abandoned - failed;
  const completionRate = Math.round((completed / totalSessions) * 1000) / 10;
  return {
    analytics: {
      ...base,
      outcome_distribution: [
        { outcome: 'completed', count: completed },
        { outcome: 'abandoned', count: abandoned },
        { outcome: 'failed', count: failed },
        { outcome: 'unknown', count: unknown },
      ].filter((o) => o.count > 0),
      completion_summary: {
        ...base.completion_summary,
        completed,
        abandoned,
        failed,
        unknown,
        completion_rate: completionRate,
      },
      retry_patterns: [
        ...base.retry_patterns,
        {
          file: 'packages/worker/src/dos/team/sessions.ts',
          attempts: 11,
          agents: 3,
          tools: ['claude-code', 'cursor'],
          final_outcome: 'failed',
          resolved: false,
        },
        {
          file: 'packages/web/src/widgets/bodies/ToolWidgets.tsx',
          attempts: 8,
          agents: 2,
          tools: ['cursor', 'claude-code'],
          final_outcome: 'abandoned',
          resolved: false,
        },
        {
          file: 'packages/mcp/lib/extraction/engine.ts',
          attempts: 7,
          agents: 2,
          tools: ['claude-code'],
          final_outcome: 'failed',
          resolved: false,
        },
      ],
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// Stuck heavy: ~32% of sessions hit the 15-min stuckness threshold. Lights
// up the stuckness stat, the stuck-vs-normal completion split, and the
// retry-pattern volume. Outcome mix stays roughly healthy: this scenario
// isolates the "agents kept going but spent a lot of time stuck" question.
function stuckHeavy(): DemoData {
  const base = createBaselineAnalytics();
  const totalSessions = base.completion_summary.total_sessions;
  const stuckSessions = Math.round(totalSessions * 0.32);
  const stuckCompleted = Math.round(stuckSessions * 0.42);
  const normalSessions = totalSessions - stuckSessions;
  const normalCompleted = Math.max(0, base.completion_summary.completed - stuckCompleted);
  return {
    analytics: {
      ...base,
      stuckness: {
        total_sessions: totalSessions,
        stuck_sessions: stuckSessions,
        stuckness_rate: Math.round((stuckSessions / totalSessions) * 100),
        stuck_completion_rate: Math.round((stuckCompleted / Math.max(1, stuckSessions)) * 100),
        normal_completion_rate: Math.round((normalCompleted / Math.max(1, normalSessions)) * 100),
        // Heavier stuck-list to match the elevated stuckness rate. Mix of
        // recovered + still-stuck so the renderer's recovered indicator has
        // both states to show.
        stuck_sessions_list: [
          {
            session_id: 'sess-stuck-h1',
            agent_id: 'agent-glendon-cc-7',
            host_tool: 'claude-code',
            last_activity_at: new Date(Date.now() - 22 * 60_000).toISOString(),
            duration_minutes: 78,
            recovered: false,
            file_path: 'packages/worker/src/dos/team/context.ts',
          },
          {
            session_id: 'sess-stuck-h2',
            agent_id: 'agent-sora-cursor-4',
            host_tool: 'cursor',
            last_activity_at: new Date(Date.now() - 75 * 60_000).toISOString(),
            duration_minutes: 52,
            recovered: true,
            file_path: 'packages/web/src/views/OverviewView/OverviewView.tsx',
          },
          {
            session_id: 'sess-stuck-h3',
            agent_id: 'agent-jae-aider-2',
            host_tool: 'aider',
            last_activity_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
            duration_minutes: 46,
            recovered: false,
            file_path: 'packages/mcp/lib/extraction/engine.ts',
          },
          {
            session_id: 'sess-stuck-h4',
            agent_id: 'agent-pax-cline-1',
            host_tool: 'cline',
            last_activity_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
            duration_minutes: 38,
            recovered: true,
            file_path: 'packages/cli/lib/dashboard/App.tsx',
          },
          {
            session_id: 'sess-stuck-h5',
            agent_id: 'agent-mika-windsurf-1',
            host_tool: 'windsurf',
            last_activity_at: new Date(Date.now() - 9 * 3600_000).toISOString(),
            duration_minutes: 31,
            recovered: false,
            file_path: 'packages/shared/tool-registry.ts',
          },
        ],
      },
      retry_patterns: [
        ...base.retry_patterns,
        {
          file: 'packages/worker/src/dos/team/context.ts',
          attempts: 9,
          agents: 3,
          tools: ['claude-code', 'cursor', 'aider'],
          final_outcome: 'completed',
          resolved: true,
        },
        {
          file: 'packages/web/src/views/OverviewView/OverviewView.tsx',
          attempts: 8,
          agents: 2,
          tools: ['cursor', 'claude-code'],
          final_outcome: 'completed',
          resolved: true,
        },
      ],
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// High cost: cost-per-edit elevated, Opus dominant in by_model. The current
// period is materially more expensive than the previous, so the cost stat
// card's delta turns red and the model breakdown leans toward the costly
// model.
function highCost(): DemoData {
  const base = createBaselineAnalytics();
  const inflateCost = 1.85;
  const inflateCostPerEdit = 1.68;
  const byModel = base.token_usage.by_model.map((m) => {
    const isOpus = m.agent_model.toLowerCase().includes('opus');
    const factor = isOpus ? 2.4 : 0.85;
    return {
      ...m,
      estimated_cost_usd:
        m.estimated_cost_usd != null ? Math.round(m.estimated_cost_usd * factor * 100) / 100 : null,
    };
  });
  const newTotalCost =
    base.token_usage.total_estimated_cost_usd != null
      ? Math.round(base.token_usage.total_estimated_cost_usd * inflateCost * 100) / 100
      : null;
  const newCostPerEdit =
    base.token_usage.cost_per_edit != null
      ? Math.round(base.token_usage.cost_per_edit * inflateCostPerEdit * 10_000) / 10_000
      : null;
  const curr = base.period_comparison.current;
  return {
    analytics: {
      ...base,
      token_usage: {
        ...base.token_usage,
        total_estimated_cost_usd: newTotalCost,
        cost_per_edit: newCostPerEdit,
        by_model: byModel,
      },
      period_comparison: {
        current: {
          ...curr,
          total_estimated_cost_usd: newTotalCost,
          cost_per_edit: newCostPerEdit,
        },
        previous: base.period_comparison.previous
          ? {
              ...base.period_comparison.previous,
              total_estimated_cost_usd:
                base.period_comparison.previous.total_estimated_cost_usd != null
                  ? Math.round(
                      base.period_comparison.previous.total_estimated_cost_usd * 0.62 * 100,
                    ) / 100
                  : null,
              cost_per_edit:
                base.period_comparison.previous.cost_per_edit != null
                  ? Math.round(base.period_comparison.previous.cost_per_edit * 0.6 * 10_000) /
                    10_000
                  : null,
            }
          : null,
      },
    },
    conversation: createBaselineConversation(),
    live: createBaselineLive(),
    reports: createBaselineReports(),
    ...baselineFrame(),
  };
}

// ── Registry ────────────────────────────────────────────────────────

export const DEMO_SCENARIOS: Record<DemoScenarioId, DemoScenario> = {
  healthy: {
    id: 'healthy',
    label: 'Healthy team',
    category: 'baseline',
    dimensions: [],
    views: ['overview', 'reports', 'tools', 'project', 'global'],
    summary: 'Full team, every widget populated, deltas trending up.',
    whatToCheck:
      'Use as the reference. Everything looks good - compare other scenarios against this one.',
    build: healthy,
  },
  empty: {
    id: 'empty',
    label: 'Empty account',
    category: 'empty-states',
    dimensions: [
      'team-size',
      'capture-depth',
      'deltas',
      'coordination',
      'memory',
      'live-presence',
      'outcomes',
    ],
    views: ['overview', 'reports', 'tools', 'project', 'global'],
    summary: 'A new account with zero activity yet.',
    whatToCheck: 'Every widget should show a real empty state, never a fake zero or ghost bars.',
    build: empty,
  },
  'solo-cc': {
    id: 'solo-cc',
    label: 'Solo, Claude Code',
    category: 'coverage',
    dimensions: ['team-size', 'coordination'],
    views: ['overview', 'project', 'reports', 'tools'],
    summary: 'One person on Claude Code only. No team to coordinate with.',
    whatToCheck:
      'Team and handoff widgets show empty states; deep-capture stats stay rich because Claude Code has the data.',
    build: soloCC,
  },
  'solo-no-hooks': {
    id: 'solo-no-hooks',
    label: 'Solo, no hooks',
    category: 'coverage',
    dimensions: ['team-size', 'capture-depth', 'coordination'],
    views: ['overview', 'project', 'reports', 'tools'],
    summary: 'One person on JetBrains. MCP only, no hooks, no deep capture.',
    whatToCheck:
      'Cost, tokens, tool calls, conversations all show "needs hooks" coverage notes instead of fake zeros.',
    build: soloNoHooks,
  },
  'mixed-capture': {
    id: 'mixed-capture',
    label: 'Mixed capture',
    category: 'coverage',
    dimensions: ['capture-depth'],
    views: ['overview', 'reports', 'tools'],
    summary: 'Realistic team where some tools have hooks and some do not.',
    whatToCheck:
      'Coverage notes appear on cost / conversation / tool-call widgets; data-coverage tile shows partial.',
    build: mixedCapture,
  },
  'stale-pricing': {
    id: 'stale-pricing',
    label: 'Stale pricing',
    category: 'pricing',
    dimensions: ['pricing'],
    views: ['overview', 'tools'],
    summary: 'Pricing data is more than a week old, so cost is paused.',
    whatToCheck:
      'Cost stat renders "--" with a "pricing refresh pending" coverage note instead of $0.',
    build: stalePricing,
  },
  'models-without-pricing': {
    id: 'models-without-pricing',
    label: 'Unpriced models',
    category: 'pricing',
    dimensions: ['pricing'],
    views: ['overview', 'tools'],
    summary: 'Some models that ran are not in the LiteLLM pricing snapshot.',
    whatToCheck:
      'Cost is partial; coverage note names which models lack pricing instead of dropping them silently.',
    build: modelsWithoutPricing,
  },
  'first-period': {
    id: 'first-period',
    label: 'First period',
    category: 'deltas',
    dimensions: ['deltas'],
    views: ['overview', 'project'],
    summary: 'First time using the dashboard. No prior week to compare against.',
    whatToCheck: 'Every "+X% vs prior" pill should disappear, not show a fake green zero.',
    build: firstPeriod,
  },
  'negative-delta': {
    id: 'negative-delta',
    label: 'Things got worse',
    category: 'deltas',
    dimensions: ['deltas', 'outcomes'],
    views: ['overview', 'project'],
    summary: 'Completion is down and cost is up versus last period.',
    whatToCheck:
      'Stat-card deltas turn red and point down; bad-direction colours invert correctly (cost-up = red, completion-down = red).',
    build: negativeDelta,
  },
  'no-live-agents': {
    id: 'no-live-agents',
    label: 'No one online',
    category: 'empty-states',
    dimensions: ['live-presence'],
    views: ['overview', 'project'],
    summary: 'Nobody is working right now, but historical data is intact.',
    whatToCheck:
      'Live presence + live conflicts show their empty states. Period KPIs stay populated.',
    build: noLiveAgents,
  },
  'team-conflicts': {
    id: 'team-conflicts',
    label: 'Team in conflict',
    category: 'coordination',
    dimensions: ['coordination', 'outcomes'],
    views: ['overview', 'reports', 'project'],
    summary: 'Active team with collisions, retries, and overlapping edits.',
    whatToCheck:
      'Live conflicts populated; retry hotspots and file-overlap surfaces show the coordination story end-to-end.',
    build: teamConflicts,
  },
  'failure-heavy': {
    id: 'failure-heavy',
    label: 'Lots of failures',
    category: 'outcomes',
    dimensions: ['outcomes'],
    views: ['overview', 'reports'],
    summary: 'Many sessions are being abandoned or failing outright.',
    whatToCheck:
      'Outcome ring tilts toward red; failed-files / retry-pattern widgets dominate; Failures report has a real story.',
    build: failureHeavy,
  },
  'stuck-heavy': {
    id: 'stuck-heavy',
    label: 'Sessions get stuck',
    category: 'outcomes',
    dimensions: ['outcomes'],
    views: ['overview', 'reports'],
    summary: 'About a third of sessions hit the 15-minute stuck threshold.',
    whatToCheck:
      'Stuckness stat elevated; stuck-vs-normal completion split widens; retry-pattern list lights up.',
    build: stuckHeavy,
  },
  'high-cost': {
    id: 'high-cost',
    label: 'High cost period',
    category: 'outcomes',
    dimensions: ['pricing', 'outcomes'],
    views: ['overview', 'tools'],
    summary: 'Cost is up; the expensive model dominates the mix.',
    whatToCheck:
      'Cost-per-edit stat shows a red delta vs prior; by-model bar leans toward Opus; tool cost ranking shifts.',
    build: highCost,
  },
  'memory-stale': {
    id: 'memory-stale',
    label: 'Memory, stale',
    category: 'memory',
    dimensions: ['memory'],
    views: ['overview'],
    summary: 'Memory has not been pruned in months. Most entries are over 90 days old.',
    whatToCheck:
      'Memory tile + freshness panel show stale warning tints; supersession proposals queue up.',
    build: memoryStale,
  },
  'memory-concentrated': {
    id: 'memory-concentrated',
    label: 'Memory, concentrated',
    category: 'memory',
    dimensions: ['memory'],
    views: ['overview'],
    summary: 'Most directories have only one memory author. High concentration risk.',
    whatToCheck: 'Single-author directory list shows severe-share tints (>=80%).',
    build: memoryConcentrated,
  },
};

/** Stable display order for the category headings in the popover and the
 *  /demo browse page. Coverage / outcomes / coordination come before the
 *  edge-state buckets so devs hit the meatier scenarios first. */
export const DEMO_CATEGORY_ORDER: DemoCategory[] = [
  'baseline',
  'coverage',
  'outcomes',
  'coordination',
  'pricing',
  'deltas',
  'memory',
  'empty-states',
];

export const DEMO_CATEGORY_LABELS: Record<DemoCategory, string> = {
  baseline: 'Baseline',
  coverage: 'Tool coverage',
  outcomes: 'Outcomes',
  coordination: 'Coordination',
  pricing: 'Pricing',
  deltas: 'Period deltas',
  memory: 'Memory',
  'empty-states': 'Empty states',
};

export const DEMO_DIMENSION_LABELS: Record<DemoDimension, string> = {
  'team-size': 'Team size',
  'capture-depth': 'Capture depth',
  pricing: 'Pricing',
  deltas: 'Deltas',
  coordination: 'Coordination',
  memory: 'Memory',
  'live-presence': 'Live presence',
  outcomes: 'Outcomes',
};

export const DEMO_VIEW_LABELS: Record<DemoView, string> = {
  overview: 'Overview',
  reports: 'Reports',
  tools: 'Tools',
  project: 'Project',
  global: 'Global',
};

export const DEMO_SCENARIO_IDS = Object.keys(DEMO_SCENARIOS) as DemoScenarioId[];

export const DEFAULT_SCENARIO: DemoScenarioId = 'healthy';

export function isDemoScenarioId(value: string | null | undefined): value is DemoScenarioId {
  return typeof value === 'string' && value in DEMO_SCENARIOS;
}

export function getDemoData(id?: string | null): DemoData {
  if (isDemoScenarioId(id)) return DEMO_SCENARIOS[id].build();
  return DEMO_SCENARIOS[DEFAULT_SCENARIO].build();
}
