/**
 * Analytics and workflow intelligence types.
 *
 * Covers heatmaps, trends, distributions, behavioral patterns,
 * period comparisons, token usage, and data coverage.
 */

import { z } from 'zod';

// ── Base analytics types ─────────────────────────

// Numeric counters across the analytics surface default to 0 so consumers
// that call schema.parse({}) get a usable empty object, and so a missing
// field on an older payload never short-circuits the whole response. Strings
// stay required: handles, days, model names, and outcomes are identity-
// bearing - a missing one is a producer bug, not a backward-compat case.
// Nullable scalars (cost fields, primary_tool) default to null so callers can
// distinguish "not measured" from "measured zero."

export const fileHeatmapEntrySchema = z.object({
  file: z.string(),
  touch_count: z.number().default(0),
  work_type: z.string().optional(),
  outcome_rate: z.number().optional(),
  total_lines_added: z.number().optional(),
  total_lines_removed: z.number().optional(),
});
export type FileHeatmapEntry = z.infer<typeof fileHeatmapEntrySchema>;

export const dailyTrendSchema = z.object({
  day: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
  avg_duration_min: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
  // Per-day cost and cost-per-edit, populated post-query by
  // enrichDailyTrendsWithPricing. Null on any day where cost is
  // structurally unshowable - no token-capturing sessions that day,
  // all-unpriced models, or stale pricing - so the trend widget can plot
  // these metrics without emitting bogus zeros. Default null so older
  // payloads parse cleanly.
  cost: z.number().nullable().default(null),
  cost_per_edit: z.number().nullable().default(null),
});
export type DailyTrend = z.infer<typeof dailyTrendSchema>;

export const outcomeCountSchema = z.object({
  outcome: z.string(),
  count: z.number().default(0),
});
export type OutcomeCount = z.infer<typeof outcomeCountSchema>;

export const toolDistributionSchema = z.object({
  host_tool: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
});
export type ToolDistribution = z.infer<typeof toolDistributionSchema>;

export const dailyMetricEntrySchema = z.object({
  date: z.string(),
  metric: z.string(),
  count: z.number().default(0),
});
export type DailyMetricEntry = z.infer<typeof dailyMetricEntrySchema>;

export const teamAnalyticsSchema = z.object({
  ok: z.literal(true),
  period_days: z.number().default(0),
  file_heatmap: z.array(fileHeatmapEntrySchema).default([]),
  daily_trends: z.array(dailyTrendSchema).default([]),
  tool_distribution: z.array(toolDistributionSchema).default([]),
  outcome_distribution: z.array(outcomeCountSchema).default([]),
  daily_metrics: z.array(dailyMetricEntrySchema).default([]),
  // Uncapped COUNT(DISTINCT file_path) from the edits table. Distinct from
  // file_heatmap.length, which is capped at HEATMAP_LIMIT=50 and is meant
  // for the ranked "most-touched files" list, not a scalar total.
  files_touched_total: z.number().default(0),
  // In-window half split of files_touched: distinct file count over the
  // current half vs the previous half of the same window. Lets the overview
  // widget render a delta on a metric that isn't additive across days
  // (distinct counts don't sum). Null when the window is too short to split
  // (periodDays < 2) or no data exists. Defaults to null so older producers
  // parse cleanly.
  files_touched_half_split: z
    .object({
      current: z.number(),
      previous: z.number(),
    })
    .nullable()
    .default(null),
});
export type TeamAnalytics = z.infer<typeof teamAnalyticsSchema>;

// ── Hourly and tool-level breakdowns ─────────────

export const hourlyBucketSchema = z.object({
  hour: z.number(),
  dow: z.number(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
});
export type HourlyBucket = z.infer<typeof hourlyBucketSchema>;

export const toolDailyTrendSchema = z.object({
  host_tool: z.string(),
  day: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
  avg_duration_min: z.number().default(0),
});
export type ToolDailyTrend = z.infer<typeof toolDailyTrendSchema>;

export const modelOutcomeSchema = z.object({
  agent_model: z.string(),
  // host_tool is nullable for backwards-compat with existing serialized
  // rows; new aggregations always populate it. Splitting the model axis by
  // tool is what makes the models widget substrate-unique (cross-tool
  // attribution no single-tool dashboard can produce).
  host_tool: z.string().nullable().default(null),
  outcome: z.string(),
  count: z.number().default(0),
  avg_duration_min: z.number().default(0),
  total_edits: z.number().default(0),
  total_lines_added: z.number().default(0),
  total_lines_removed: z.number().default(0),
});
export type ModelOutcome = z.infer<typeof modelOutcomeSchema>;

export const toolOutcomeSchema = z.object({
  host_tool: z.string(),
  outcome: z.string(),
  count: z.number().default(0),
});
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;

// ── Workflow intelligence ────────────────────────

export const completionSummarySchema = z.object({
  total_sessions: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
  unknown: z.number().default(0),
  completion_rate: z.number().default(0),
  prev_completion_rate: z.number().nullable().default(null),
  // Total sessions in the previous-window comparison query. Required to
  // weight prev_completion_rate correctly when merging across teams: a
  // user with 100 prev sessions at 60% and 200 prev sessions at 40% must
  // collapse to 46.67% (weighted by prev_total_sessions), not 50% (a
  // simple per-team average) and not the broken weight-by-current-total
  // approximation we shipped before this companion field existed.
  // Defaults to 0 so older payloads parse cleanly; consumers gate on
  // prev_completion_rate != null before using it.
  prev_total_sessions: z.number().default(0),
});
export type CompletionSummary = z.infer<typeof completionSummarySchema>;

export const toolComparisonSchema = z.object({
  host_tool: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
  completion_rate: z.number().default(0),
  avg_duration_min: z.number().default(0),
  total_edits: z.number().default(0),
  total_lines_added: z.number().default(0),
  total_lines_removed: z.number().default(0),
  // Wall-clock hours summed across completed sessions only (ended_at
  // IS NOT NULL). Matches queryEditVelocity's denominator so per-tool
  // rates in the Edits drill reconcile with the aggregate sparkline.
  total_session_hours: z.number().default(0),
});
export type ToolComparison = z.infer<typeof toolComparisonSchema>;

export const workTypeDistributionSchema = z.object({
  work_type: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
  files: z.number().default(0),
});
export type WorkTypeDistribution = z.infer<typeof workTypeDistributionSchema>;

export const toolWorkTypeBreakdownSchema = z.object({
  host_tool: z.string(),
  work_type: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  /** Sessions touching this work-type that ended outcome='completed'. Used
   *  alongside `sessions` so the renderer can show absolute completed counts
   *  next to the rate (preserves the rate-without-volume D3a failure mode
   *  the rubric flags). Defaults to 0 so older payloads parse cleanly. */
  completed: z.number().default(0),
  /** completed / sessions × 100, rounded to 1 decimal. The substrate-unique
   *  cell: chinmeister is the only system that can fill a tools × work-types
   *  matrix with completion rates from competing vendor agents on the same
   *  repo. Defaults to 0 so older payloads parse cleanly. */
  completion_rate: z.number().default(0),
});
export type ToolWorkTypeBreakdown = z.infer<typeof toolWorkTypeBreakdownSchema>;

export const fileChurnEntrySchema = z.object({
  file: z.string(),
  session_count: z.number().default(0),
  total_edits: z.number().default(0),
  total_lines: z.number().default(0),
});
export type FileChurnEntry = z.infer<typeof fileChurnEntrySchema>;

export const durationBucketSchema = z.object({
  bucket: z.string(),
  count: z.number().default(0),
});
export type DurationBucket = z.infer<typeof durationBucketSchema>;

export const concurrentEditEntrySchema = z.object({
  file: z.string(),
  agents: z.number().default(0),
  edit_count: z.number().default(0),
});
export type ConcurrentEditEntry = z.infer<typeof concurrentEditEntrySchema>;

// Audit 2026-04-21: Pruned to fields actual consumers read. Dropped:
//   abandoned, failed - not rendered anywhere (completion_rate is the
//     consumed summary; raw outcome splits were ghosted aggregation work).
//   avg_duration_min - only shown on ModelOutcome, not member rows.
//   total_lines_added, total_lines_removed, total_commits - wiring these up
//     would commit the team-members widget to a GitHub-clone framing. They
//     can be re-added when a drill view calls for them; the SQL is not a
//     load-bearing source of truth.
// `completed` is retained because cross-team completion_rate derivation needs
// raw numerator + denominator; averaging per-team rates is wrong.
export const memberAnalyticsSchema = z.object({
  handle: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  completion_rate: z.number().default(0),
  total_edits: z.number().default(0),
  primary_tool: z.string().nullable().default(null),
  // Same semantics as toolComparisonSchema.total_session_hours -
  // completed-session wall-clock sum, used as the per-teammate velocity
  // denominator in the Edits drill.
  total_session_hours: z.number().default(0),
});
export type MemberAnalytics = z.infer<typeof memberAnalyticsSchema>;

// Audit 2026-04-21: Regrouped from (handle, file) to file only. The old shape
// let one noisy agent dominate the top-N: if handle-A hit Button.tsx 8 times
// and handle-B twice, the renderer showed two rows for the same file. The
// new shape is file-centric - attempts are summed across agents, and the
// agent / tool distinctness counts surface the cross-agent and cross-tool
// angle that is actually substrate-unique (vs. Claude Code's own session log
// which is per-tool). `tools` is the list of host_tools that contributed to
// the retries, deduped; `agents` is the number of distinct handles that
// retried this file.
export const retryPatternSchema = z.object({
  file: z.string(),
  attempts: z.number().default(0),
  agents: z.number().default(0),
  tools: z.array(z.string()).default([]),
  final_outcome: z.string().nullable().default(null),
  resolved: z.boolean().default(false),
});
export type RetryPattern = z.infer<typeof retryPatternSchema>;

export const conflictCorrelationSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  completion_rate: z.number().default(0),
});
export type ConflictCorrelation = z.infer<typeof conflictCorrelationSchema>;

export const conflictDailyEntrySchema = z.object({
  day: z.string(),
  blocked: z.number().default(0),
});
export type ConflictDailyEntry = z.infer<typeof conflictDailyEntrySchema>;

export const conflictStatsSchema = z.object({
  /** Hook-sourced blocks: PreToolUse calls that found conflicts and prevented the edit. */
  blocked_period: z.number().default(0),
  /** Every detection in the period, including advisory MCP-tool lookups. */
  found_period: z.number().default(0),
  /** Daily breakdown of blocked counts over the period. Default to [] for
   *  older producers; renderer falls back to the scalar-only view when empty. */
  daily_blocked: z.array(conflictDailyEntrySchema).default([]),
});
export type ConflictStats = z.infer<typeof conflictStatsSchema>;

export const editVelocityTrendSchema = z.object({
  day: z.string(),
  edits_per_hour: z.number().default(0),
  lines_per_hour: z.number().default(0),
  total_session_hours: z.number().default(0),
});

// Per-project (team) velocity rollup - one entry per team the caller
// belongs to, preserving the cross-project view that the aggregate
// edit_velocity otherwise collapses. total_session_hours uses the same
// `ended_at IS NOT NULL` denominator as queryEditVelocity so per-project
// rates reconcile with the aggregate sparkline. `primary_tool` is the
// host_tool with the most sessions in this project; null when the project
// has no tool-identified sessions. Powers the Edits drill's per-project
// section.
export const projectVelocityRollupSchema = z.object({
  team_id: z.string(),
  team_name: z.string().nullable().default(null),
  sessions: z.number().default(0),
  total_edits: z.number().default(0),
  total_session_hours: z.number().default(0),
  edits_per_hour: z.number().default(0),
  primary_tool: z.string().nullable().default(null),
});
export type ProjectVelocityRollup = z.infer<typeof projectVelocityRollupSchema>;
export type EditVelocityTrend = z.infer<typeof editVelocityTrendSchema>;

// Per-teammate daily timeline of lines attribution. Scoped to the top 50
// handles by total edits in the period (matching memberAnalyticsSchema's
// LIMIT 50 semantics so the two fields agree on which teammates exist).
// Zero-filled across the full period via the recursive-CTE spine pattern,
// so each handle's sparkline is dense. Powers the Lines drill's per-member
// stacked-area view.
export const memberDailyLineTrendSchema = z.object({
  handle: z.string(),
  day: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
});
export type MemberDailyLineTrend = z.infer<typeof memberDailyLineTrendSchema>;

// Per-project (team) daily timeline of lines attribution, preserving team
// identity across the cross-team aggregation that collapses `daily_trends`.
// team_id is the same identifier exposed by GET /me/teams; team_name is
// included so clients don't need a second round-trip to render a label.
// Powers the Lines drill's per-project split view.
export const projectLinesTrendSchema = z.object({
  team_id: z.string(),
  team_name: z.string().nullable().default(null),
  day: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
});
export type ProjectLinesTrend = z.infer<typeof projectLinesTrendSchema>;

export const formationRecommendationCountsSchema = z.object({
  keep: z.number().default(0),
  merge: z.number().default(0),
  evolve: z.number().default(0),
  discard: z.number().default(0),
});
export type FormationRecommendationCounts = z.infer<typeof formationRecommendationCountsSchema>;

export const memoryUsageStatsSchema = z.object({
  total_memories: z.number().default(0),
  searches: z.number().default(0),
  searches_with_results: z.number().default(0),
  search_hit_rate: z.number().default(0),
  memories_created_period: z.number().default(0),
  stale_memories: z.number().default(0),
  avg_memory_age_days: z.number().default(0),
  // Live count of consolidation proposals awaiting human / agent review.
  pending_consolidation_proposals: z.number().default(0),
  // Live count of unaddressed formation observations by recommendation
  // (status = 'observed'). 'keep' is the trivial case; merge/evolve/discard
  // are flag candidates. Age does not gate - a year-old unaddressed flag
  // still needs a decision, so this query runs without a time filter.
  formation_observations_by_recommendation: formationRecommendationCountsSchema.default({
    keep: 0,
    merge: 0,
    evolve: 0,
    discard: 0,
  }),
  // Live count of secret-detector blocks in the last 24h. Signal that the
  // filter is doing work; counts before-and-after force=true. Windowed at
  // 24h (not the global period picker) so the memory-safety review surface
  // stays live: a recent block is actionable, an old block is audit history.
  secrets_blocked_24h: z.number().default(0),
});
export type MemoryUsageStats = z.infer<typeof memoryUsageStatsSchema>;

export const workTypeOutcomeSchema = z.object({
  work_type: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
  completion_rate: z.number().default(0),
});
export type WorkTypeOutcome = z.infer<typeof workTypeOutcomeSchema>;

export const conversationEditCorrelationSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  avg_edits: z.number().default(0),
  avg_lines: z.number().default(0),
  completion_rate: z.number().default(0),
});
export type ConversationEditCorrelation = z.infer<typeof conversationEditCorrelationSchema>;

export const fileReworkEntrySchema = z.object({
  file: z.string(),
  total_edits: z.number().default(0),
  failed_edits: z.number().default(0),
  rework_ratio: z.number().default(0),
});
export type FileReworkEntry = z.infer<typeof fileReworkEntrySchema>;

// Files where the user-side conversation showed confusion or frustration in
// 2+ sessions touching the file. Sentiment is an INPUT to the file-axis
// question - never the headline - which is the framing ANALYTICS_SPEC §10
// anti-pattern #1 explicitly endorses (sentiment as input to coordination).
// retried_sessions is a sub-count of confused_sessions whose outcome was
// abandoned/failed; useful as severity hint, kept optional so older
// producers stay parseable.
export const confusedFileEntrySchema = z.object({
  file: z.string(),
  confused_sessions: z.number().default(0),
  retried_sessions: z.number().default(0),
});
export type ConfusedFileEntry = z.infer<typeof confusedFileEntrySchema>;

// Scalar count of user messages classified topic='question' inside sessions
// that ended abandoned. The signal is "intent the agent couldn't fulfill,"
// surfaced as a navigation aid (same shape as live-conflicts: number drives
// drill into the underlying sessions).
export const unansweredQuestionStatsSchema = z.object({
  count: z.number().default(0),
});
export type UnansweredQuestionStats = z.infer<typeof unansweredQuestionStatsSchema>;

// Cross-tool question handoffs. An event-axis row: a session abandoned with
// the user's last turn classified as a question, followed within H hours by
// a session in a *different* tool that edited at least one of the same
// files AND opened with another question or a confused/frustrated user
// turn. The substrate-unique question this answers - which no single-tool
// analytics surface can - is "did my agent's abandoned question survive a
// tool switch, or did the next tool start cold and re-ask?"
//
// Sentiment/topic are inputs to the ranking, not displayed metrics - the
// row surfaces files, tools, and gap-time, never the message content or
// the polarity. ANALYTICS_SPEC §10 #1 firewall preserved.
export const crossToolHandoffEntrySchema = z.object({
  /** File both sessions edited. */
  file: z.string(),
  /** Tool that abandoned the session mid-question. */
  tool_from: z.string(),
  /** Tool that picked up the same file with a question or confused turn. */
  tool_to: z.string(),
  /** Handle of the abandoning session. */
  handle_from: z.string(),
  /** Handle of the picking-up session. Same as handle_from for solo
   *  multi-tool, different for cross-developer handoffs. */
  handle_to: z.string(),
  /** Minutes between S1.ended_at and S2.started_at. */
  gap_minutes: z.number().default(0),
  /** ISO timestamp of the picking-up session's start (sort key). */
  handoff_at: z.string(),
});
export type CrossToolHandoffEntry = z.infer<typeof crossToolHandoffEntrySchema>;

// Cross-tool memory flow. For each (author_tool, consumer_tool) pair, count
// memories authored by author_tool that were available to consumer_tool's
// sessions in the window. Built on the memory_search_results join
// (migration 028 / ANALYTICS_SPEC §11) so the read is what was actually
// retrieved, not the available pool. Tool-axis only - per-handle flow
// would step into ANALYTICS_SPEC §10 #4 (surveillance) and is not
// emitted by this query. Detail-view English questions: which tools share
// memory most? · which categories cross tools? · does cross-tool memory
// help completion? · how fresh is shared knowledge? · which sessions
// benefited from another tool's memory?
export const crossToolMemoryFlowEntrySchema = z.object({
  author_tool: z.string(),
  consumer_tool: z.string(),
  memories_read: z.number().default(0),
  reading_sessions: z.number().default(0),
});
export type CrossToolMemoryFlowEntry = z.infer<typeof crossToolMemoryFlowEntrySchema>;

// Memory aging composition: count of currently-live memories grouped into
// freshness buckets. Lifetime scope by design (catalog timeScope='all-time')
// so the picker doesn't apply. Detail-view English questions: is knowledge
// fresh? · which categories age fastest? · accumulating or replacing? ·
// which directories have fresh knowledge? · who keeps memory current?
export const memoryAgingCompositionSchema = z.object({
  recent_7d: z.number().default(0),
  recent_30d: z.number().default(0),
  recent_90d: z.number().default(0),
  older: z.number().default(0),
});
export type MemoryAgingComposition = z.infer<typeof memoryAgingCompositionSchema>;

// Memory categories: top agent-assigned categories on currently-live
// memories, ranked by count, with last-touch hint per row. Categories are
// optional at save time, so a low-coverage team will see a thin list - the
// empty state names that gate. Detail-view English questions: top categories?
// · which help completion? · which directories have which categories? ·
// who authors which? · how has the mix shifted?
export const memoryCategoryEntrySchema = z.object({
  category: z.string(),
  count: z.number().default(0),
  last_used_at: z.string().nullable().default(null),
});
export type MemoryCategoryEntry = z.infer<typeof memoryCategoryEntrySchema>;

// Single-author directory concentration. Handle-blind reframe of bus-factor:
// per directory, count of memories with exactly one author vs total. Surfaces
// the directory (a coordination axis), never names handles. Detail questions:
// which directories carry single-author memory, period delta, second-author
// resilience trend, concentrated dirs by traffic, team-wide authorship spread.
export const memorySingleAuthorDirectoryEntrySchema = z.object({
  directory: z.string(),
  single_author_count: z.number().default(0),
  total_count: z.number().default(0),
});
export type MemorySingleAuthorDirectoryEntry = z.infer<
  typeof memorySingleAuthorDirectoryEntrySchema
>;

// Memory supersession flow: live counters for the consolidation pipeline.
// invalidated_period and merged_period scope by event time; pending_proposals
// is current-state. Detail questions: retired vs merged this period, queue
// depth + age, categories with most supersession, merge clustering by
// directory, median memory lifespan.
export const memorySupersessionStatsSchema = z.object({
  invalidated_period: z.number().default(0),
  merged_period: z.number().default(0),
  pending_proposals: z.number().default(0),
});
export type MemorySupersessionStats = z.infer<typeof memorySupersessionStatsSchema>;

// Secrets shield stats: blocked_period rolls up daily_metrics.secrets_blocked
// over the picker window, blocked_24h is the live last-24h counter. Detail
// questions: how many leaks attempted, which tools tried, trend, patterns
// caught most, false-positive cost.
export const memorySecretsShieldStatsSchema = z.object({
  blocked_period: z.number().default(0),
  blocked_24h: z.number().default(0),
});
export type MemorySecretsShieldStats = z.infer<typeof memorySecretsShieldStatsSchema>;

export const directoryHeatmapEntrySchema = z.object({
  directory: z.string(),
  touch_count: z.number().default(0),
  file_count: z.number().default(0),
  total_lines: z.number().default(0),
  // Session-distinct outcome counts. The denominator is unique sessions that
  // touched any file in this directory (not file-touch pairs), and the
  // numerator is the subset whose outcome was 'completed'. completion_rate
  // is derived from these and exposed alongside so cross-team aggregation can
  // re-derive honestly instead of weighted-averaging weighted-averages.
  completed_sessions: z.number().default(0),
  total_sessions: z.number().default(0),
  completion_rate: z.number().default(0),
});
export type DirectoryHeatmapEntry = z.infer<typeof directoryHeatmapEntrySchema>;

// Files-touched breadth breakdowns. Both read from the `edits` table with
// `work_type` normalized on write (migration 018). Feed the Files-Touched
// drill hero: strip viz + new-vs-revisited split. Distinct file counts, not
// edit counts - breadth, not depth.
export const filesByWorkTypeEntrySchema = z.object({
  work_type: z.string(),
  file_count: z.number().default(0),
});
export type FilesByWorkTypeEntry = z.infer<typeof filesByWorkTypeEntrySchema>;

export const filesNewVsRevisitedSchema = z.object({
  // File's earliest edit ever is inside the current window.
  new_files: z.number().default(0),
  // File was first touched before the window opened but also touched within it.
  revisited_files: z.number().default(0),
});
export type FilesNewVsRevisited = z.infer<typeof filesNewVsRevisitedSchema>;

export const stucknessStatsSchema = z.object({
  total_sessions: z.number().default(0),
  stuck_sessions: z.number().default(0),
  stuckness_rate: z.number().default(0),
  stuck_completion_rate: z.number().default(0),
  normal_completion_rate: z.number().default(0),
});
export type StucknessStats = z.infer<typeof stucknessStatsSchema>;

// Audit 2026-04-21: Dropped `overlap_rate`. The percentage was a B1 ambiguity
// in the renderer ("60%" reads as good paired work or bad collision depending
// on context). Absolute counts stay - total_files and overlapping_files are
// concrete; consumers that need a rate recompute it from the counts.
export const fileOverlapStatsSchema = z.object({
  total_files: z.number().default(0),
  overlapping_files: z.number().default(0),
});
export type FileOverlapStats = z.infer<typeof fileOverlapStatsSchema>;

export const auditStalenessEntrySchema = z.object({
  directory: z.string(),
  last_edit: z.string(),
  days_since: z.number().default(0),
  prior_edit_count: z.number().default(0),
});
export type AuditStalenessEntry = z.infer<typeof auditStalenessEntrySchema>;

export const firstEditStatsSchema = z.object({
  avg_minutes_to_first_edit: z.number().default(0),
  median_minutes_to_first_edit: z.number().default(0),
  by_tool: z
    .array(
      z.object({
        host_tool: z.string(),
        avg_minutes: z.number().default(0),
        sessions: z.number().default(0),
      }),
    )
    .default([]),
});
export type FirstEditStats = z.infer<typeof firstEditStatsSchema>;

export const memoryOutcomeCorrelationSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  completion_rate: z.number().default(0),
});
export type MemoryOutcomeCorrelation = z.infer<typeof memoryOutcomeCorrelationSchema>;

// Per-memory outcome correlation. For each memory returned in this period's
// searches, the count of sessions that returned it and the completion rate
// of those sessions. Enabled by the memory_search_results join (migration
// 028 / ANALYTICS_SPEC section 11). Min-sample gate is enforced in the
// query so the read can't surface high-variance per-memory rates from a
// single session. The framing is correlation, not causation: §10 #7 forbids
// "hit rate as quality" — the question is "sessions that read this memory
// completed at X%, vs Y% baseline."
export const memoryPerEntryOutcomeSchema = z.object({
  id: z.string(),
  text_preview: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  completion_rate: z.number().default(0),
});
export type MemoryPerEntryOutcome = z.infer<typeof memoryPerEntryOutcomeSchema>;

export const memoryAccessEntrySchema = z.object({
  id: z.string(),
  text_preview: z.string(),
  access_count: z.number().default(0),
  last_accessed_at: z.string().nullable().default(null),
});
export type MemoryAccessEntry = z.infer<typeof memoryAccessEntrySchema>;

export const scopeComplexityBucketSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  avg_edits: z.number().default(0),
  avg_duration_min: z.number().default(0),
  completion_rate: z.number().default(0),
});
export type ScopeComplexityBucket = z.infer<typeof scopeComplexityBucketSchema>;

export const promptEfficiencyTrendSchema = z.object({
  day: z.string(),
  // Nullable: the worker emits null for days with no conversation+edit
  // activity (NULLIF on zero edits → no outer COALESCE). The client
  // treats null as "skip this point" rather than rendering a zero floor.
  avg_turns_per_edit: z.number().nullable().default(null),
  sessions: z.number().default(0),
});
export type PromptEfficiencyTrend = z.infer<typeof promptEfficiencyTrendSchema>;

export const hourlyEffectivenessSchema = z.object({
  hour: z.number(),
  sessions: z.number().default(0),
  completion_rate: z.number().default(0),
  avg_edits: z.number().default(0),
});
export type HourlyEffectiveness = z.infer<typeof hourlyEffectivenessSchema>;

export const outcomeTagCountSchema = z.object({
  tag: z.string(),
  count: z.number().default(0),
  outcome: z.string(),
});
export type OutcomeTagCount = z.infer<typeof outcomeTagCountSchema>;

export const toolHandoffRecentFileSchema = z.object({
  file_path: z.string(),
  last_transition_at: z.string(),
  a_edits: z.number().default(0),
  b_edits: z.number().default(0),
  completed: z.boolean().default(false),
});
export type ToolHandoffRecentFile = z.infer<typeof toolHandoffRecentFileSchema>;

export const toolHandoffSchema = z.object({
  from_tool: z.string(),
  to_tool: z.string(),
  file_count: z.number().default(0),
  handoff_completion_rate: z.number().default(0),
  avg_gap_minutes: z.number().default(0),
  recent_files: z.array(toolHandoffRecentFileSchema).default([]),
});
export type ToolHandoff = z.infer<typeof toolHandoffSchema>;

// ── Tool call analytics ────────────────────────

export const toolCallFrequencySchema = z.object({
  tool: z.string(),
  calls: z.number().default(0),
  errors: z.number().default(0),
  error_rate: z.number().default(0),
  avg_duration_ms: z.number().default(0),
  sessions: z.number().default(0),
});
export type ToolCallFrequency = z.infer<typeof toolCallFrequencySchema>;

/** Per-host-tool one-shot rate. Different axis from ToolCallFrequency, which
 *  keys on the tool-call name (Edit/Bash). This entry keys on host_tool
 *  (claude-code/cursor/...) and answers "which tool's sessions land first-try
 *  most often." Substrate-unique: chinmeister is the only system that can
 *  compare one-shot rates head-to-head across competing vendor agents on the
 *  same repo and same work-type mix. Both fields default to 0 so older
 *  payloads parse cleanly. */
export const hostToolOneShotSchema = z.object({
  host_tool: z.string(),
  /** % of this tool's sessions with edits where edits worked without an
   *  Edit→Bash→Edit retry cycle (0-100). */
  one_shot_rate: z.number().default(0),
  /** Sessions with edits used as the denominator. UI gates the metric on a
   *  minimum sample size (≥3) to avoid one-of-one displays. */
  sessions: z.number().default(0),
});
export type HostToolOneShot = z.infer<typeof hostToolOneShotSchema>;

export const toolCallErrorPatternSchema = z.object({
  tool: z.string(),
  error_preview: z.string(),
  count: z.number().default(0),
  // ISO timestamp of the most recent occurrence. Lets the errors widget
  // surface a recency pane alongside frequency so rare-but-recent errors
  // don't get buried under high-count historical ones. Nullable to stay
  // compatible with old payloads.
  last_at: z.string().nullable().default(null),
});
export type ToolCallErrorPattern = z.infer<typeof toolCallErrorPatternSchema>;

export const toolCallTimelineSchema = z.object({
  hour: z.number(),
  calls: z.number().default(0),
  errors: z.number().default(0),
});
export type ToolCallTimeline = z.infer<typeof toolCallTimelineSchema>;

export const toolCallStatsSchema = z.object({
  total_calls: z.number().default(0),
  total_errors: z.number().default(0),
  error_rate: z.number().default(0),
  avg_duration_ms: z.number().default(0),
  calls_per_session: z.number().default(0),
  research_to_edit_ratio: z.number().default(0),
  /** Percentage of sessions where the first edit succeeded without retry (0-100). */
  one_shot_rate: z.number().default(0),
  /** Number of sessions with edits used in the one-shot calculation. */
  one_shot_sessions: z.number().default(0),
  frequency: z.array(toolCallFrequencySchema).default([]),
  error_patterns: z.array(toolCallErrorPatternSchema).default([]),
  hourly_activity: z.array(toolCallTimelineSchema).default([]),
  /** Per-host-tool one-shot breakdown. Empty for older producers. Renderer
   *  gates per-row on a minimum sample size to avoid one-of-one displays. */
  host_one_shot: z.array(hostToolOneShotSchema).default([]),
});
export type ToolCallStats = z.infer<typeof toolCallStatsSchema>;

// ── Commit analytics ──────────────────────────────

export const commitToolBreakdownSchema = z.object({
  host_tool: z.string(),
  commits: z.number().default(0),
  avg_files_changed: z.number().default(0),
  avg_lines: z.number().default(0),
});
export type CommitToolBreakdown = z.infer<typeof commitToolBreakdownSchema>;

export const dailyCommitSchema = z.object({
  day: z.string(),
  commits: z.number().default(0),
});
export type DailyCommit = z.infer<typeof dailyCommitSchema>;

export const commitOutcomeCorrelationSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  completion_rate: z.number().default(0),
});
export type CommitOutcomeCorrelation = z.infer<typeof commitOutcomeCorrelationSchema>;

export const commitEditRatioBucketSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  completion_rate: z.number().default(0),
  avg_edits: z.number().default(0),
  avg_commits: z.number().default(0),
});
export type CommitEditRatioBucket = z.infer<typeof commitEditRatioBucketSchema>;

export const commitStatsSchema = z.object({
  total_commits: z.number().default(0),
  commits_per_session: z.number().default(0),
  sessions_with_commits: z.number().default(0),
  avg_time_to_first_commit_min: z.number().nullable().default(null),
  by_tool: z.array(commitToolBreakdownSchema).default([]),
  daily_commits: z.array(dailyCommitSchema).default([]),
  outcome_correlation: z.array(commitOutcomeCorrelationSchema).default([]),
  commit_edit_ratio: z.array(commitEditRatioBucketSchema).default([]),
});
export type CommitStats = z.infer<typeof commitStatsSchema>;

// ── Period-over-period comparison ────────────────

export const periodMetricsSchema = z.object({
  completion_rate: z.number().default(0),
  avg_duration_min: z.number().default(0),
  stuckness_rate: z.number().default(0),
  memory_hit_rate: z.number().default(0),
  edit_velocity: z.number().default(0),
  total_sessions: z.number().default(0),
  /** Total USD cost for this period's token-capturing sessions. Null when
   *  pricing is stale, no token data was captured, or every model in the
   *  period was missing from LiteLLM pricing. Both windows are priced
   *  against the CURRENT pricing snapshot so deltas reflect behavior
   *  change, not Anthropic/OpenAI price movement. */
  total_estimated_cost_usd: z.number().nullable().default(null),
  /** Sum of edit_count across sessions where input_tokens IS NOT NULL in
   *  this period. Denominator for cost_per_edit. Always countable (no null). */
  total_edits_in_token_sessions: z.number().default(0),
  /** Period-scoped cost divided by edits. See field above for the
   *  retroactive-pricing semantic. Null under the same conditions as
   *  total_estimated_cost_usd OR when total_edits_in_token_sessions is 0. */
  cost_per_edit: z.number().nullable().default(null),
});
export type PeriodMetrics = z.infer<typeof periodMetricsSchema>;

export const periodComparisonSchema = z.object({
  current: periodMetricsSchema.default({
    completion_rate: 0,
    avg_duration_min: 0,
    stuckness_rate: 0,
    memory_hit_rate: 0,
    edit_velocity: 0,
    total_sessions: 0,
    total_estimated_cost_usd: null,
    total_edits_in_token_sessions: 0,
    cost_per_edit: null,
  }),
  previous: periodMetricsSchema.nullable().default(null),
});
export type PeriodComparison = z.infer<typeof periodComparisonSchema>;

// ── Token usage ─────────────────────────────────

export const tokenModelBreakdownSchema = z.object({
  agent_model: z.string(),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_tokens: z.number().default(0),
  cache_creation_tokens: z.number().default(0),
  sessions: z.number().default(0),
  // Null when the model isn't in our LiteLLM snapshot, or when the snapshot
  // is >7 days stale. UI should render "-" rather than "$0" in that case.
  estimated_cost_usd: z.number().nullable().default(null),
});
export type TokenModelBreakdown = z.infer<typeof tokenModelBreakdownSchema>;

export const tokenToolBreakdownSchema = z.object({
  host_tool: z.string(),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_tokens: z.number().default(0),
  cache_creation_tokens: z.number().default(0),
  sessions: z.number().default(0),
});
export type TokenToolBreakdown = z.infer<typeof tokenToolBreakdownSchema>;

export const tokenUsageStatsSchema = z.object({
  total_input_tokens: z.number().default(0),
  total_output_tokens: z.number().default(0),
  total_cache_read_tokens: z.number().default(0),
  total_cache_creation_tokens: z.number().default(0),
  avg_input_per_session: z.number().default(0),
  avg_output_per_session: z.number().default(0),
  sessions_with_token_data: z.number().default(0),
  sessions_without_token_data: z.number().default(0),
  /** Sum of edit_count across sessions where input_tokens IS NOT NULL.
   *  This is the denominator for cost_per_edit - scoping to token-capturing
   *  sessions is what prevents mixing populations (e.g. Cursor contributing
   *  edits without token data would otherwise deflate the ratio). */
  total_edits_in_token_sessions: z.number().default(0),
  /** Total USD cost across priced models. Null when pricing is stale
   *  (>7 days) OR no model in the period was in the LiteLLM snapshot.
   *  Zero only when sessions exist but token totals are literally zero -
   *  UI must distinguish null (unknown) from 0 (measured). */
  total_estimated_cost_usd: z.number().nullable().default(null),
  // ISO timestamp of the most recent successful LiteLLM pricing refresh, or
  // null if no refresh has ever succeeded. UI reads this + pricing_is_stale
  // to decide whether to show a staleness banner.
  pricing_refreshed_at: z.string().nullable().default(null),
  // True when the snapshot is >7 days old. The enrichment layer zeroes
  // costs in that state rather than serving stale numbers.
  pricing_is_stale: z.boolean().default(false),
  // Canonical names we couldn't price, capped at MAX_UNPRICED_REPORTED (20).
  // Drives a "coverage gap" surface so we know when the resolver needs
  // updating. Complemented by models_without_pricing_total below.
  models_without_pricing: z.array(z.string()).default([]),
  // Total count of unknown models, including any beyond the display cap.
  // A response with 20 in the list and total = 100 signals that the resolver
  // is missing a large swath of real production models - much louder than
  // silently truncating. Always >= models_without_pricing.length.
  models_without_pricing_total: z.number().default(0),
  /** Cost divided by total edits across sessions with token data. Null when no edits. */
  cost_per_edit: z.number().nullable().default(null),
  /** cache_read_tokens / (input + cache_read + cache_creation). 0-1, null when no tokens. */
  cache_hit_rate: z.number().nullable().default(null),
  by_model: z.array(tokenModelBreakdownSchema).default([]),
  by_tool: z.array(tokenToolBreakdownSchema).default([]),
});
export type TokenUsageStats = z.infer<typeof tokenUsageStatsSchema>;

/**
 * Reports which tools contributed data and which couldn't,
 * based on declared data capabilities in the tool registry.
 * Attached to analytics responses so the UI can annotate partial coverage.
 */
export const dataCoverageSchema = z.object({
  /** Tools that contributed data to this analytics response. */
  tools_reporting: z.array(z.string()).default([]),
  /** Active tools that lacked capability to contribute specific data. */
  tools_without_data: z.array(z.string()).default([]),
  /** Ratio of tools_reporting to total active tools (0-1). */
  coverage_rate: z.number().default(0),
  /** Data capabilities that are covered by at least one active tool. */
  capabilities_available: z.array(z.string()).default([]),
  /** Data capabilities that no active tool supports. */
  capabilities_missing: z.array(z.string()).default([]),
});
export type DataCoverage = z.infer<typeof dataCoverageSchema>;

/** Cross-team user analytics - extends base TeamAnalytics with advanced breakdowns. */
export const userAnalyticsSchema = teamAnalyticsSchema.extend({
  hourly_distribution: z.array(hourlyBucketSchema).default([]),
  tool_daily: z.array(toolDailyTrendSchema).default([]),
  model_outcomes: z.array(modelOutcomeSchema).default([]),
  tool_outcomes: z.array(toolOutcomeSchema).default([]),
  completion_summary: completionSummarySchema.default({
    total_sessions: 0,
    completed: 0,
    abandoned: 0,
    failed: 0,
    unknown: 0,
    completion_rate: 0,
    prev_completion_rate: null,
    prev_total_sessions: 0,
  }),
  tool_comparison: z.array(toolComparisonSchema).default([]),
  work_type_distribution: z.array(workTypeDistributionSchema).default([]),
  tool_work_type: z.array(toolWorkTypeBreakdownSchema).default([]),
  file_churn: z.array(fileChurnEntrySchema).default([]),
  duration_distribution: z.array(durationBucketSchema).default([]),
  concurrent_edits: z.array(concurrentEditEntrySchema).default([]),
  member_analytics: z.array(memberAnalyticsSchema).default([]),
  // Uncapped count of distinct handles with activity in the window. Ships
  // alongside member_analytics (which is capped at 50 per team) so the
  // renderer can surface a truthful "+N more" affordance when the team
  // has more active members than the rendered list.
  member_analytics_total: z.number().default(0),
  retry_patterns: z.array(retryPatternSchema).default([]),
  conflict_correlation: z.array(conflictCorrelationSchema).default([]),
  conflict_stats: conflictStatsSchema.default({
    blocked_period: 0,
    found_period: 0,
    daily_blocked: [],
  }),
  edit_velocity: z.array(editVelocityTrendSchema).default([]),
  // Lines drill axes. Default to [] so older producers stay compatible.
  member_daily_lines: z.array(memberDailyLineTrendSchema).default([]),
  per_project_lines: z.array(projectLinesTrendSchema).default([]),
  per_project_velocity: z.array(projectVelocityRollupSchema).default([]),
  memory_usage: memoryUsageStatsSchema.default({
    total_memories: 0,
    searches: 0,
    searches_with_results: 0,
    search_hit_rate: 0,
    memories_created_period: 0,
    stale_memories: 0,
    avg_memory_age_days: 0,
    pending_consolidation_proposals: 0,
    formation_observations_by_recommendation: { keep: 0, merge: 0, evolve: 0, discard: 0 },
    secrets_blocked_24h: 0,
  }),
  work_type_outcomes: z.array(workTypeOutcomeSchema).default([]),
  conversation_edit_correlation: z.array(conversationEditCorrelationSchema).default([]),
  // Conversation widgets revived 2026-04-25. Both gate on conversationLogs
  // capability (Claude Code + Aider today). Default to empty/zero for
  // older producers and tools without conversation capture.
  confused_files: z.array(confusedFileEntrySchema).default([]),
  unanswered_questions: unansweredQuestionStatsSchema.default({ count: 0 }),
  // Cross-tool question handoffs (added 2026-04-26). Substrate-unique to
  // chinmeister: requires conversation capture across two tools that share
  // a file. Default empty so older producers and single-tool teams parse
  // cleanly; the renderer's empty state names the 2+ tool requirement.
  cross_tool_handoff_questions: z.array(crossToolHandoffEntrySchema).default([]),
  // Memory + team category density additions 2026-04-25 (post-audit). Each
  // anchors a multi-question detail view (see schema doc-comments for the
  // English questions). Defaults so older producers parse cleanly.
  cross_tool_memory_flow: z.array(crossToolMemoryFlowEntrySchema).default([]),
  memory_aging: memoryAgingCompositionSchema.default({
    recent_7d: 0,
    recent_30d: 0,
    recent_90d: 0,
    older: 0,
  }),
  memory_categories: z.array(memoryCategoryEntrySchema).default([]),
  // Memory + team category re-revivals 2026-04-25 (post 18-month re-audit).
  // Each anchors a multi-question detail view; the original audit cut/queued
  // these on today-state arguments that the rubric preamble forbids.
  memory_single_author_directories: z.array(memorySingleAuthorDirectoryEntrySchema).default([]),
  memory_supersession: memorySupersessionStatsSchema.default({
    invalidated_period: 0,
    merged_period: 0,
    pending_proposals: 0,
  }),
  memory_secrets_shield: memorySecretsShieldStatsSchema.default({
    blocked_period: 0,
    blocked_24h: 0,
  }),
  file_rework: z.array(fileReworkEntrySchema).default([]),
  directory_heatmap: z.array(directoryHeatmapEntrySchema).default([]),
  // Files-touched breadth anatomy. Both default to sensible empties so
  // older producers parse cleanly; the UI gates on length / sum.
  files_by_work_type: z.array(filesByWorkTypeEntrySchema).default([]),
  files_new_vs_revisited: filesNewVsRevisitedSchema.default({ new_files: 0, revisited_files: 0 }),
  stuckness: stucknessStatsSchema.default({
    total_sessions: 0,
    stuck_sessions: 0,
    stuckness_rate: 0,
    stuck_completion_rate: 0,
    normal_completion_rate: 0,
  }),
  file_overlap: fileOverlapStatsSchema.default({ total_files: 0, overlapping_files: 0 }),
  audit_staleness: z.array(auditStalenessEntrySchema).default([]),
  first_edit_stats: firstEditStatsSchema.default({
    avg_minutes_to_first_edit: 0,
    median_minutes_to_first_edit: 0,
    by_tool: [],
  }),
  memory_outcome_correlation: z.array(memoryOutcomeCorrelationSchema).default([]),
  memory_per_entry_outcomes: z.array(memoryPerEntryOutcomeSchema).default([]),
  top_memories: z.array(memoryAccessEntrySchema).default([]),
  scope_complexity: z.array(scopeComplexityBucketSchema).default([]),
  prompt_efficiency: z.array(promptEfficiencyTrendSchema).default([]),
  hourly_effectiveness: z.array(hourlyEffectivenessSchema).default([]),
  outcome_tags: z.array(outcomeTagCountSchema).default([]),
  tool_handoffs: z.array(toolHandoffSchema).default([]),
  period_comparison: periodComparisonSchema.default({
    current: {
      completion_rate: 0,
      avg_duration_min: 0,
      stuckness_rate: 0,
      memory_hit_rate: 0,
      edit_velocity: 0,
      total_sessions: 0,
      total_estimated_cost_usd: null,
      total_edits_in_token_sessions: 0,
      cost_per_edit: null,
    },
    previous: null,
  }),
  token_usage: tokenUsageStatsSchema.default({
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_creation_tokens: 0,
    avg_input_per_session: 0,
    avg_output_per_session: 0,
    sessions_with_token_data: 0,
    sessions_without_token_data: 0,
    total_edits_in_token_sessions: 0,
    total_estimated_cost_usd: null,
    pricing_refreshed_at: null,
    pricing_is_stale: false,
    models_without_pricing: [],
    models_without_pricing_total: 0,
    cost_per_edit: null,
    cache_hit_rate: null,
    by_model: [],
    by_tool: [],
  }),
  tool_call_stats: toolCallStatsSchema.default({
    total_calls: 0,
    total_errors: 0,
    error_rate: 0,
    avg_duration_ms: 0,
    calls_per_session: 0,
    research_to_edit_ratio: 0,
    one_shot_rate: 0,
    one_shot_sessions: 0,
    frequency: [],
    error_patterns: [],
    hourly_activity: [],
    host_one_shot: [],
  }),
  commit_stats: commitStatsSchema.default({
    total_commits: 0,
    commits_per_session: 0,
    sessions_with_commits: 0,
    avg_time_to_first_commit_min: null,
    by_tool: [],
    daily_commits: [],
    outcome_correlation: [],
    commit_edit_ratio: [],
  }),
  teams_included: z.number().default(0),
  degraded: z.boolean().default(false),
  // Number of teams the route dropped before fan-out due to MAX_DASHBOARD_TEAMS.
  // Zero means every team the user belongs to was included; positive means N
  // teams were truncated (and the UI must surface that visibly so users don't
  // misread the response as "all your projects" when it isn't). Distinct from
  // `degraded`, which is per-team RPC failure, not a deliberate cap.
  truncated_teams: z.number().default(0),
  // Per-label tally of fan-out failures. Keys are structural categories
  // (timeout, rpc_error, unhandled, shape_mismatch); values are counts of
  // teams that hit each label. Counts only, team IDs are never exposed,
  // because that would leak which project failed to whom. The dashboard
  // can render "1 timeout" + "2 rpc_error" instead of an opaque
  // `degraded: true`. Empty object on the success path.
  failure_labels: z.record(z.string(), z.number()).default({}),
  data_coverage: dataCoverageSchema.optional(),
});
export type UserAnalytics = z.infer<typeof userAnalyticsSchema>;
