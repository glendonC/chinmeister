// Team and user analytics schemas.

import { z } from 'zod';

// ── Team analytics ──────────────────────────────────

const fileHeatmapEntrySchema = z.object({
  file: z.string(),
  touch_count: z.number(),
  work_type: z.string().optional(),
  outcome_rate: z.number().optional(),
  total_lines_added: z.number().optional(),
  total_lines_removed: z.number().optional(),
});

const dailyTrendSchema = z.object({
  day: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
  avg_duration_min: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
});

const outcomeCountSchema = z.object({
  outcome: z.string(),
  count: z.number().default(0),
});

const toolDistributionSchema = z.object({
  host_tool: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
});

const dailyMetricEntrySchema = z.object({
  date: z.string(),
  metric: z.string(),
  count: z.number().default(0),
});

export const teamAnalyticsSchema = z.object({
  ok: z.literal(true),
  period_days: z.number(),
  file_heatmap: z.array(fileHeatmapEntrySchema).default([]),
  daily_trends: z.array(dailyTrendSchema).default([]),
  tool_distribution: z.array(toolDistributionSchema).default([]),
  outcome_distribution: z.array(outcomeCountSchema).default([]),
  daily_metrics: z.array(dailyMetricEntrySchema).default([]),
});

export type TeamAnalytics = z.infer<typeof teamAnalyticsSchema>;
export type FileHeatmapEntry = z.infer<typeof fileHeatmapEntrySchema>;
export type DailyTrend = z.infer<typeof dailyTrendSchema>;
export type OutcomeCount = z.infer<typeof outcomeCountSchema>;
export type ToolDistributionEntry = z.infer<typeof toolDistributionSchema>;
export type DailyMetricEntry = z.infer<typeof dailyMetricEntrySchema>;

export function createEmptyAnalytics(): TeamAnalytics {
  return {
    ok: true,
    period_days: 7,
    file_heatmap: [],
    daily_trends: [],
    tool_distribution: [],
    outcome_distribution: [],
    daily_metrics: [],
  };
}

// ── User analytics (cross-project aggregate) ─────────

const hourlyBucketSchema = z.object({
  hour: z.number(),
  dow: z.number(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
});

const modelOutcomeSchema = z.object({
  agent_model: z.string(),
  outcome: z.string(),
  count: z.number().default(0),
  avg_duration_min: z.number().default(0),
  total_edits: z.number().default(0),
  total_lines_added: z.number().default(0),
  total_lines_removed: z.number().default(0),
});

const toolOutcomeSchema = z.object({
  host_tool: z.string(),
  outcome: z.string(),
  count: z.number().default(0),
});

const toolHourlyBucketSchema = z.object({
  host_tool: z.string(),
  hour: z.number(),
  dow: z.number(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
});

const toolDailyTrendSchema = z.object({
  host_tool: z.string(),
  day: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
  avg_duration_min: z.number().default(0),
});

const completionSummarySchema = z.object({
  total_sessions: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
  unknown: z.number().default(0),
  completion_rate: z.number().default(0),
  prev_completion_rate: z.number().nullable().default(null),
});

const toolComparisonSchema = z.object({
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
});

const workTypeDistributionSchema = z.object({
  work_type: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
  lines_added: z.number().default(0),
  lines_removed: z.number().default(0),
  files: z.number().default(0),
});

const toolWorkTypeBreakdownSchema = z.object({
  host_tool: z.string(),
  work_type: z.string(),
  sessions: z.number().default(0),
  edits: z.number().default(0),
});

const fileChurnEntrySchema = z.object({
  file: z.string(),
  session_count: z.number().default(0),
  total_edits: z.number().default(0),
  total_lines: z.number().default(0),
});

const durationBucketSchema = z.object({
  bucket: z.string(),
  count: z.number().default(0),
});

const concurrentEditEntrySchema = z.object({
  file: z.string(),
  agents: z.number().default(0),
  edit_count: z.number().default(0),
});

const memberAnalyticsSchema = z.object({
  handle: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
  completion_rate: z.number().default(0),
  avg_duration_min: z.number().default(0),
  total_edits: z.number().default(0),
  total_lines_added: z.number().default(0),
  total_lines_removed: z.number().default(0),
  primary_tool: z.string().nullable().default(null),
});

const retryPatternSchema = z.object({
  handle: z.string(),
  file: z.string(),
  attempts: z.number().default(0),
  final_outcome: z.string().nullable().default(null),
  resolved: z.boolean().default(false),
});

const conflictCorrelationSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  completion_rate: z.number().default(0),
});

const editVelocityTrendSchema = z.object({
  day: z.string(),
  edits_per_hour: z.number().default(0),
  lines_per_hour: z.number().default(0),
  total_session_hours: z.number().default(0),
});

const memoryUsageStatsSchema = z.object({
  total_memories: z.number().default(0),
  searches: z.number().default(0),
  searches_with_results: z.number().default(0),
  search_hit_rate: z.number().default(0),
  memories_created_period: z.number().default(0),
  memories_updated_period: z.number().default(0),
  stale_memories: z.number().default(0),
  avg_memory_age_days: z.number().default(0),
});

const workTypeOutcomeSchema = z.object({
  work_type: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
  completion_rate: z.number().default(0),
});

const conversationEditCorrelationSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  avg_edits: z.number().default(0),
  avg_lines: z.number().default(0),
  completion_rate: z.number().default(0),
});

const fileReworkEntrySchema = z.object({
  file: z.string(),
  total_edits: z.number().default(0),
  failed_edits: z.number().default(0),
  rework_ratio: z.number().default(0),
});

const directoryHeatmapEntrySchema = z.object({
  directory: z.string(),
  touch_count: z.number().default(0),
  file_count: z.number().default(0),
  total_lines: z.number().default(0),
  completion_rate: z.number().default(0),
});

const stucknessStatsSchema = z.object({
  total_sessions: z.number().default(0),
  stuck_sessions: z.number().default(0),
  stuckness_rate: z.number().default(0),
  stuck_completion_rate: z.number().default(0),
  normal_completion_rate: z.number().default(0),
});

const fileOverlapStatsSchema = z.object({
  total_files: z.number().default(0),
  overlapping_files: z.number().default(0),
  overlap_rate: z.number().default(0),
});

const auditStalenessEntrySchema = z.object({
  directory: z.string(),
  last_edit: z.string(),
  days_since: z.number().default(0),
  prior_edit_count: z.number().default(0),
});

const firstEditStatsSchema = z.object({
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

const memoryOutcomeCorrelationSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  completion_rate: z.number().default(0),
});

const memoryAccessEntrySchema = z.object({
  id: z.string(),
  text_preview: z.string(),
  access_count: z.number().default(0),
  last_accessed_at: z.string().nullable().default(null),
  created_at: z.string(),
});

const scopeComplexityBucketSchema = z.object({
  bucket: z.string(),
  sessions: z.number().default(0),
  avg_edits: z.number().default(0),
  avg_duration_min: z.number().default(0),
  completion_rate: z.number().default(0),
});

const promptEfficiencyTrendSchema = z.object({
  day: z.string(),
  avg_turns_per_edit: z.number().default(0),
  sessions: z.number().default(0),
});

const hourlyEffectivenessSchema = z.object({
  hour: z.number(),
  sessions: z.number().default(0),
  completion_rate: z.number().default(0),
  avg_edits: z.number().default(0),
});

const outcomeTagCountSchema = z.object({
  tag: z.string(),
  count: z.number().default(0),
  outcome: z.string(),
});

const toolHandoffSchema = z.object({
  from_tool: z.string(),
  to_tool: z.string(),
  file_count: z.number().default(0),
  handoff_completion_rate: z.number().default(0),
});

const outcomePredictorSchema = z.object({
  outcome: z.string(),
  avg_first_edit_min: z.number().default(0),
  sessions: z.number().default(0),
});

const periodMetricsSchema = z.object({
  completion_rate: z.number().default(0),
  avg_duration_min: z.number().default(0),
  stuckness_rate: z.number().default(0),
  memory_hit_rate: z.number().default(0),
  edit_velocity: z.number().default(0),
  total_sessions: z.number().default(0),
});

const periodComparisonSchema = z.object({
  current: periodMetricsSchema,
  previous: periodMetricsSchema.nullable().default(null),
});

const tokenModelBreakdownSchema = z.object({
  agent_model: z.string(),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  sessions: z.number().default(0),
  estimated_cost_usd: z.number().optional(),
});

const tokenToolBreakdownSchema = z.object({
  host_tool: z.string(),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  sessions: z.number().default(0),
});

const tokenUsageStatsSchema = z.object({
  total_input_tokens: z.number().default(0),
  total_output_tokens: z.number().default(0),
  avg_input_per_session: z.number().default(0),
  avg_output_per_session: z.number().default(0),
  sessions_with_token_data: z.number().default(0),
  sessions_without_token_data: z.number().default(0),
  total_estimated_cost_usd: z.number().default(0),
  by_model: z.array(tokenModelBreakdownSchema).default([]),
  by_tool: z.array(tokenToolBreakdownSchema).default([]),
});

// ── Data coverage (capability-based) ──────────────

const dataCoverageSchema = z.object({
  tools_reporting: z.array(z.string()).default([]),
  tools_without_data: z.array(z.string()).default([]),
  coverage_rate: z.number().default(1),
  capabilities_available: z.array(z.string()).default([]),
  capabilities_missing: z.array(z.string()).default([]),
});

export const userAnalyticsSchema = teamAnalyticsSchema.extend({
  hourly_distribution: z.array(hourlyBucketSchema).default([]),
  tool_hourly: z.array(toolHourlyBucketSchema).default([]),
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
  }),
  tool_comparison: z.array(toolComparisonSchema).default([]),
  work_type_distribution: z.array(workTypeDistributionSchema).default([]),
  tool_work_type: z.array(toolWorkTypeBreakdownSchema).default([]),
  file_churn: z.array(fileChurnEntrySchema).default([]),
  duration_distribution: z.array(durationBucketSchema).default([]),
  concurrent_edits: z.array(concurrentEditEntrySchema).default([]),
  member_analytics: z.array(memberAnalyticsSchema).default([]),
  retry_patterns: z.array(retryPatternSchema).default([]),
  conflict_correlation: z.array(conflictCorrelationSchema).default([]),
  edit_velocity: z.array(editVelocityTrendSchema).default([]),
  memory_usage: memoryUsageStatsSchema.default({
    total_memories: 0,
    searches: 0,
    searches_with_results: 0,
    search_hit_rate: 0,
    memories_created_period: 0,
    memories_updated_period: 0,
    stale_memories: 0,
    avg_memory_age_days: 0,
  }),
  work_type_outcomes: z.array(workTypeOutcomeSchema).default([]),
  conversation_edit_correlation: z.array(conversationEditCorrelationSchema).default([]),
  file_rework: z.array(fileReworkEntrySchema).default([]),
  directory_heatmap: z.array(directoryHeatmapEntrySchema).default([]),
  stuckness: stucknessStatsSchema.default({
    total_sessions: 0,
    stuck_sessions: 0,
    stuckness_rate: 0,
    stuck_completion_rate: 0,
    normal_completion_rate: 0,
  }),
  file_overlap: fileOverlapStatsSchema.default({
    total_files: 0,
    overlapping_files: 0,
    overlap_rate: 0,
  }),
  audit_staleness: z.array(auditStalenessEntrySchema).default([]),
  first_edit_stats: firstEditStatsSchema.default({
    avg_minutes_to_first_edit: 0,
    median_minutes_to_first_edit: 0,
    by_tool: [],
  }),
  memory_outcome_correlation: z.array(memoryOutcomeCorrelationSchema).default([]),
  top_memories: z.array(memoryAccessEntrySchema).default([]),
  scope_complexity: z.array(scopeComplexityBucketSchema).default([]),
  prompt_efficiency: z.array(promptEfficiencyTrendSchema).default([]),
  hourly_effectiveness: z.array(hourlyEffectivenessSchema).default([]),
  outcome_tags: z.array(outcomeTagCountSchema).default([]),
  tool_handoffs: z.array(toolHandoffSchema).default([]),
  outcome_predictors: z.array(outcomePredictorSchema).default([]),
  period_comparison: periodComparisonSchema.default({
    current: {
      completion_rate: 0,
      avg_duration_min: 0,
      stuckness_rate: 0,
      memory_hit_rate: 0,
      edit_velocity: 0,
      total_sessions: 0,
    },
    previous: null,
  }),
  token_usage: tokenUsageStatsSchema.default({
    total_input_tokens: 0,
    total_output_tokens: 0,
    avg_input_per_session: 0,
    avg_output_per_session: 0,
    sessions_with_token_data: 0,
    sessions_without_token_data: 0,
    total_estimated_cost_usd: 0,
    by_model: [],
    by_tool: [],
  }),
  teams_included: z.number().default(0),
  degraded: z.boolean().default(false),
  data_coverage: dataCoverageSchema.optional(),
});

export type UserAnalytics = z.infer<typeof userAnalyticsSchema>;
export type HourlyBucket = z.infer<typeof hourlyBucketSchema>;
export type ToolHourlyBucket = z.infer<typeof toolHourlyBucketSchema>;
export type ToolDailyTrend = z.infer<typeof toolDailyTrendSchema>;
export type ModelOutcome = z.infer<typeof modelOutcomeSchema>;
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;
export type CompletionSummary = z.infer<typeof completionSummarySchema>;
export type ToolComparison = z.infer<typeof toolComparisonSchema>;
export type WorkTypeDistribution = z.infer<typeof workTypeDistributionSchema>;
export type ToolWorkTypeBreakdown = z.infer<typeof toolWorkTypeBreakdownSchema>;
export type FileChurnEntry = z.infer<typeof fileChurnEntrySchema>;
export type DurationBucket = z.infer<typeof durationBucketSchema>;
export type ConcurrentEditEntry = z.infer<typeof concurrentEditEntrySchema>;
export type MemberAnalytics = z.infer<typeof memberAnalyticsSchema>;
export type RetryPattern = z.infer<typeof retryPatternSchema>;
export type ConflictCorrelation = z.infer<typeof conflictCorrelationSchema>;
export type EditVelocityTrend = z.infer<typeof editVelocityTrendSchema>;
export type MemoryUsageStats = z.infer<typeof memoryUsageStatsSchema>;
export type WorkTypeOutcome = z.infer<typeof workTypeOutcomeSchema>;
export type ConversationEditCorrelation = z.infer<typeof conversationEditCorrelationSchema>;
export type FileReworkEntry = z.infer<typeof fileReworkEntrySchema>;
export type DirectoryHeatmapEntry = z.infer<typeof directoryHeatmapEntrySchema>;
export type StucknessStats = z.infer<typeof stucknessStatsSchema>;
export type FileOverlapStats = z.infer<typeof fileOverlapStatsSchema>;
export type AuditStalenessEntry = z.infer<typeof auditStalenessEntrySchema>;
export type FirstEditStats = z.infer<typeof firstEditStatsSchema>;
export type MemoryOutcomeCorrelation = z.infer<typeof memoryOutcomeCorrelationSchema>;
export type MemoryAccessEntry = z.infer<typeof memoryAccessEntrySchema>;
export type ScopeComplexityBucket = z.infer<typeof scopeComplexityBucketSchema>;
export type PromptEfficiencyTrend = z.infer<typeof promptEfficiencyTrendSchema>;
export type HourlyEffectiveness = z.infer<typeof hourlyEffectivenessSchema>;
export type OutcomeTagCount = z.infer<typeof outcomeTagCountSchema>;
export type ToolHandoff = z.infer<typeof toolHandoffSchema>;
export type OutcomePredictor = z.infer<typeof outcomePredictorSchema>;
export type PeriodMetrics = z.infer<typeof periodMetricsSchema>;
export type PeriodComparison = z.infer<typeof periodComparisonSchema>;
export type TokenModelBreakdown = z.infer<typeof tokenModelBreakdownSchema>;
export type TokenToolBreakdown = z.infer<typeof tokenToolBreakdownSchema>;
export type TokenUsageStats = z.infer<typeof tokenUsageStatsSchema>;
export type DataCoverage = z.infer<typeof dataCoverageSchema>;

export function createEmptyUserAnalytics(): UserAnalytics {
  return {
    ...createEmptyAnalytics(),
    period_days: 30,
    hourly_distribution: [],
    tool_hourly: [],
    tool_daily: [],
    model_outcomes: [],
    tool_outcomes: [],
    completion_summary: {
      total_sessions: 0,
      completed: 0,
      abandoned: 0,
      failed: 0,
      unknown: 0,
      completion_rate: 0,
      prev_completion_rate: null,
    },
    tool_comparison: [],
    work_type_distribution: [],
    tool_work_type: [],
    file_churn: [],
    duration_distribution: [],
    concurrent_edits: [],
    member_analytics: [],
    retry_patterns: [],
    conflict_correlation: [],
    edit_velocity: [],
    memory_usage: {
      total_memories: 0,
      searches: 0,
      searches_with_results: 0,
      search_hit_rate: 0,
      memories_created_period: 0,
      memories_updated_period: 0,
      stale_memories: 0,
      avg_memory_age_days: 0,
    },
    work_type_outcomes: [],
    conversation_edit_correlation: [],
    file_rework: [],
    directory_heatmap: [],
    stuckness: {
      total_sessions: 0,
      stuck_sessions: 0,
      stuckness_rate: 0,
      stuck_completion_rate: 0,
      normal_completion_rate: 0,
    },
    file_overlap: {
      total_files: 0,
      overlapping_files: 0,
      overlap_rate: 0,
    },
    audit_staleness: [],
    first_edit_stats: {
      avg_minutes_to_first_edit: 0,
      median_minutes_to_first_edit: 0,
      by_tool: [],
    },
    memory_outcome_correlation: [],
    top_memories: [],
    scope_complexity: [],
    prompt_efficiency: [],
    hourly_effectiveness: [],
    outcome_tags: [],
    tool_handoffs: [],
    outcome_predictors: [],
    period_comparison: {
      current: {
        completion_rate: 0,
        avg_duration_min: 0,
        stuckness_rate: 0,
        memory_hit_rate: 0,
        edit_velocity: 0,
        total_sessions: 0,
      },
      previous: null,
    },
    token_usage: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      avg_input_per_session: 0,
      avg_output_per_session: 0,
      sessions_with_token_data: 0,
      sessions_without_token_data: 0,
      total_estimated_cost_usd: 0,
      by_model: [],
      by_tool: [],
    },
    teams_included: 0,
    degraded: false,
  };
}
