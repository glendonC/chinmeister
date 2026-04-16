// Barrel file: re-exports all analytics query functions and assembles getExtendedAnalytics.

import type { UserAnalytics } from '@chinwag/shared/contracts/analytics.js';

import { getAnalytics } from './core.js';
import {
  queryHourlyDistribution,
  queryToolHourly,
  queryToolDaily,
  queryDurationDistribution,
  queryEditVelocity,
} from './activity.js';
import {
  classifyWorkType,
  queryModelPerformance,
  queryToolOutcomes,
  queryCompletionSummary,
  queryToolComparison,
  queryWorkTypeDistribution,
  queryToolWorkType,
  queryWorkTypeOutcomes,
} from './outcomes.js';
import {
  queryFileChurn,
  queryConcurrentEdits,
  queryFileHeatmapEnhanced,
  queryFileRework,
  queryDirectoryHeatmap,
  queryAuditStaleness,
} from './codebase.js';
import {
  queryRetryPatterns,
  queryConflictCorrelation,
  queryStuckness,
  queryFileOverlap,
  queryFirstEditStats,
  queryScopeComplexity,
} from './sessions.js';
import { queryMemberAnalytics } from './team.js';
import { queryMemoryUsage, queryMemoryOutcomeCorrelation, queryTopMemories } from './memory.js';
import { queryConversationEditCorrelation } from './conversations.js';
import { queryTokenUsage } from './tokens.js';
import { queryToolCallStats } from './tool-calls.js';
import { queryCommitStats } from './commits.js';
import { queryPeriodComparison } from './comparison.js';
import {
  queryPromptEfficiency,
  queryHourlyEffectiveness,
  queryOutcomeTags,
  queryToolHandoffs,
} from './extended.js';

export { getAnalytics } from './core.js';
export { classifyWorkType } from './outcomes.js';

export function getExtendedAnalytics(
  sql: SqlStorage,
  days: number,
): Omit<UserAnalytics, 'teams_included' | 'degraded'> {
  const base = getAnalytics(sql, days);
  return {
    ...base,
    // Override basic heatmap with enhanced version
    file_heatmap: queryFileHeatmapEnhanced(sql, days),
    hourly_distribution: queryHourlyDistribution(sql, days),
    tool_hourly: queryToolHourly(sql, days),
    tool_daily: queryToolDaily(sql, days),
    model_outcomes: queryModelPerformance(sql, days),
    tool_outcomes: queryToolOutcomes(sql, days),
    completion_summary: queryCompletionSummary(sql, days),
    tool_comparison: queryToolComparison(sql, days),
    work_type_distribution: queryWorkTypeDistribution(sql, days),
    tool_work_type: queryToolWorkType(sql, days),
    file_churn: queryFileChurn(sql, days),
    duration_distribution: queryDurationDistribution(sql, days),
    concurrent_edits: queryConcurrentEdits(sql, days),
    member_analytics: queryMemberAnalytics(sql, days),
    retry_patterns: queryRetryPatterns(sql, days),
    conflict_correlation: queryConflictCorrelation(sql, days),
    edit_velocity: queryEditVelocity(sql, days),
    memory_usage: queryMemoryUsage(sql, days),
    work_type_outcomes: queryWorkTypeOutcomes(sql, days),
    conversation_edit_correlation: queryConversationEditCorrelation(sql, days),
    file_rework: queryFileRework(sql, days),
    directory_heatmap: queryDirectoryHeatmap(sql, days),
    stuckness: queryStuckness(sql, days),
    file_overlap: queryFileOverlap(sql, days),
    audit_staleness: queryAuditStaleness(sql, days),
    first_edit_stats: queryFirstEditStats(sql, days),
    memory_outcome_correlation: queryMemoryOutcomeCorrelation(sql, days),
    top_memories: queryTopMemories(sql, days),
    scope_complexity: queryScopeComplexity(sql, days),
    prompt_efficiency: queryPromptEfficiency(sql, days),
    hourly_effectiveness: queryHourlyEffectiveness(sql, days),
    outcome_tags: queryOutcomeTags(sql, days),
    tool_handoffs: queryToolHandoffs(sql, days),
    period_comparison: queryPeriodComparison(sql, days),
    token_usage: queryTokenUsage(sql, days),
    tool_call_stats: queryToolCallStats(sql, days),
    commit_stats: queryCommitStats(sql, days),
  };
}
