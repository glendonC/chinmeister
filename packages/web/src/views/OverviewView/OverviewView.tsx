import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { usePollingStore, forceRefresh } from '../../lib/stores/polling.js';
import { useAuthStore } from '../../lib/stores/auth.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { getColorHex } from '../../lib/utils.js';
import { useUserAnalytics } from '../../hooks/useUserAnalytics.js';
import { useConversationAnalytics } from '../../hooks/useConversationAnalytics.js';
import GlobalMap from '../../components/GlobalMap/GlobalMap.js';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import StatusState from '../../components/StatusState/StatusState.jsx';
import {
  ShimmerText,
  SkeletonStatGrid,
  SkeletonRows,
} from '../../components/Skeleton/Skeleton.jsx';
import { useGlobalStats } from '../../hooks/useGlobalStats.js';
import { useOverviewData } from './useOverviewData.js';
import { RANGES, type RangeDays, summarizeNames } from './overview-utils.js';

// ── Section components ───────────────────────────
import { HeadlineSection } from './sections/HeadlineSection.js';
import { LiveAgentsBar, ProjectsSection } from './sections/ProjectSections.js';
import { ToolComparisonSection, ToolHandoffsSection } from './sections/ToolSections.js';
import { PatternsSection } from './sections/PatternsSection.js';
import { ModelSection } from './sections/ModelSection.js';
import {
  TrendsSection,
  EditVelocitySection,
  PeriodDeltasSection,
  PromptEfficiencySection,
  HourlyEffectivenessSection,
  OutcomePredictorsSection,
} from './sections/TrendSections.js';
import {
  WorkTypeSection,
  WorkTypeOutcomesSection,
  ScopeComplexitySection,
} from './sections/WorkTypeSections.js';
import { StucknessSection, FirstEditSection } from './sections/StucknessSections.js';
import { TokenUsageSection } from './sections/TokenSection.js';
import {
  FileHeatmapSection,
  DirectoryHeatmapSection,
  FileChurnSection,
  FileReworkSection,
  AuditStalenessSection,
} from './sections/FileSections.js';
import {
  MemberSection,
  ConcurrentEditsSection,
  FileOverlapSection,
  ConflictCorrelationSection,
  RetryPatternsSection,
  OutcomeTagsSection,
} from './sections/CollaborationSections.js';
import {
  MemoryUsageSection,
  MemoryOutcomeSection,
  TopMemoriesSection,
} from './sections/MemorySections.js';
import {
  ConversationEditSection,
  ConversationIntelligenceSection,
} from './sections/ConversationSections.js';

import styles from './OverviewView.module.css';

// ── Main Component ────────────────────────────────

export default function OverviewView() {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);

  const { dashboardData, dashboardStatus, pollError, pollErrorData } = usePollingStore(
    useShallow((s) => ({
      dashboardData: s.dashboardData,
      dashboardStatus: s.dashboardStatus,
      pollError: s.pollError,
      pollErrorData: s.pollErrorData,
    })),
  );
  const user = useAuthStore((s) => s.user);
  const userColor = getColorHex(user?.color ?? '') || '#121317';
  const { teams, teamsError, selectTeam } = useTeamStore(
    useShallow((s) => ({
      teams: s.teams,
      teamsError: s.teamsError,
      selectTeam: s.selectTeam,
    })),
  );

  const summaries = useMemo(() => dashboardData?.teams ?? [], [dashboardData?.teams]);
  const failedTeams = useMemo(
    () => dashboardData?.failed_teams ?? pollErrorData?.failed_teams ?? [],
    [dashboardData?.failed_teams, pollErrorData?.failed_teams],
  );

  const knownTeamCount = teams.length;
  const hasKnownProjects = knownTeamCount > 0 || summaries.length > 0;
  const failedLabel = failedTeams.length > 0 ? summarizeNames(failedTeams) : '';

  const { liveAgents, sortedSummaries } = useOverviewData(summaries);
  const { analytics, isLoading: analyticsLoading } = useUserAnalytics(rangeDays, true);
  const { data: conversationData } = useConversationAnalytics(rangeDays, true);
  const globalStats = useGlobalStats();

  const isLoading = !dashboardData && (dashboardStatus === 'idle' || dashboardStatus === 'loading');
  const isUnavailable =
    dashboardStatus === 'error' || (!pollError && hasKnownProjects && summaries.length === 0);
  const unavailableHint =
    knownTeamCount === 0
      ? 'We could not load your project overview right now.'
      : knownTeamCount === 1
        ? `We found ${teams[0]?.team_name || teams[0]?.team_id || 'a connected project'}, but its overview data is unavailable right now.`
        : `We found ${knownTeamCount} connected projects, but none of their overview data could be loaded.`;
  const unavailableDetail =
    pollError ||
    (failedLabel
      ? `Unavailable now: ${failedLabel}`
      : 'Project summaries are temporarily unavailable.');

  if (isLoading) {
    return (
      <div className={styles.overview}>
        <section className={styles.header}>
          <span className={styles.eyebrow}>Overview</span>
          <ShimmerText as="h1" className={styles.loadingTitle}>
            Loading your projects
          </ShimmerText>
          <SkeletonStatGrid count={4} />
        </section>
        <SkeletonRows count={3} columns={4} />
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <div className={styles.overview}>
        <StatusState
          tone="danger"
          eyebrow="Overview unavailable"
          title="Could not load project overview"
          hint={unavailableHint}
          detail={unavailableDetail}
          meta={
            knownTeamCount > 0
              ? `${knownTeamCount} connected ${knownTeamCount === 1 ? 'project' : 'projects'}`
              : 'Overview'
          }
          actionLabel="Retry"
          onAction={forceRefresh}
        />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className={styles.overview}>
        <EmptyState
          large
          title={teamsError ? 'Could not load projects' : 'No projects yet'}
          hint={
            teamsError || (
              <>
                Run <code>npx chinwag init</code> in a repo to add one.
              </>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.overview}>
      <section className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Overview</span>
          <h1 className={styles.title}>
            Welcome back
            {user?.handle ? (
              <>
                {', '}
                <span style={{ color: userColor }}>{user.handle}</span>
              </>
            ) : null}
            .
          </h1>
        </div>

        {failedTeams.length > 0 && (
          <div className={styles.summaryNotice}>
            <span className={styles.summaryNoticeLabel}>
              {failedTeams.length} {failedTeams.length === 1 ? 'project' : 'projects'} unavailable
            </span>
            <span className={styles.summaryNoticeText}>{failedLabel}</span>
          </div>
        )}

        <div className={styles.rangeRow}>
          <div className={styles.rangeSelector} role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={clsx(styles.rangeButton, rangeDays === r && styles.rangeActive)}
                onClick={() => setRangeDays(r)}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
      </section>

      {analytics.degraded && (
        <div className={styles.summaryNotice}>
          <span className={styles.summaryNoticeLabel}>Partial data</span>
          <span className={styles.summaryNoticeText}>
            Analytics from {analytics.teams_included} of your projects. Some projects could not be
            reached.
          </span>
        </div>
      )}

      {/* ── Status + Summary ── */}

      <HeadlineSection
        analytics={analytics}
        projectCount={sortedSummaries.length}
        liveAgentCount={liveAgents.length}
      />

      <PeriodDeltasSection comparison={analytics.period_comparison} />

      <LiveAgentsBar liveAgents={liveAgents} selectTeam={selectTeam} />

      <StucknessSection stuckness={analytics.stuckness} />

      <FirstEditSection stats={analytics.first_edit_stats} />

      {/* ── Tools + Models ── */}

      <ToolComparisonSection tools={analytics.tool_comparison} />

      <ModelSection modelOutcomes={analytics.model_outcomes} />

      <TokenUsageSection usage={analytics.token_usage} />

      {/* ── Work Patterns ── */}

      <PatternsSection
        hourly={analytics.hourly_distribution}
        duration={analytics.duration_distribution}
      />

      <WorkTypeSection workTypes={analytics.work_type_distribution} />

      <WorkTypeOutcomesSection outcomes={analytics.work_type_outcomes} />

      <EditVelocitySection velocity={analytics.edit_velocity} />

      <ScopeComplexitySection data={analytics.scope_complexity} />

      <ConversationEditSection data={analytics.conversation_edit_correlation} />

      <PromptEfficiencySection data={analytics.prompt_efficiency} />

      <HourlyEffectivenessSection data={analytics.hourly_effectiveness} />

      <ConversationIntelligenceSection conv={conversationData} />

      {/* ── Codebase Activity ── */}

      <DirectoryHeatmapSection dirs={analytics.directory_heatmap} />

      <FileHeatmapSection files={analytics.file_heatmap} />

      <FileChurnSection churn={analytics.file_churn} />

      <FileReworkSection rework={analytics.file_rework} />

      <AuditStalenessSection stale={analytics.audit_staleness} />

      {/* ── Collaboration + Conflicts ── */}

      <MemberSection members={analytics.member_analytics} />

      <ConcurrentEditsSection edits={analytics.concurrent_edits} />

      <FileOverlapSection overlap={analytics.file_overlap} />

      <ConflictCorrelationSection data={analytics.conflict_correlation} />

      <RetryPatternsSection retries={analytics.retry_patterns} />

      <ToolHandoffsSection data={analytics.tool_handoffs} />

      <OutcomeTagsSection data={analytics.outcome_tags} />

      <OutcomePredictorsSection data={analytics.outcome_predictors} />

      {/* ── Memory Intelligence ── */}

      <MemoryUsageSection usage={analytics.memory_usage} />

      <MemoryOutcomeSection data={analytics.memory_outcome_correlation} />

      <TopMemoriesSection memories={analytics.top_memories} />

      {/* ── Trends + Projects ── */}

      <TrendsSection trends={analytics.daily_trends} />

      <ProjectsSection
        summaries={sortedSummaries as Array<Record<string, unknown>>}
        liveAgents={liveAgents}
        selectTeam={selectTeam}
      />

      <GlobalMap countries={globalStats.countries} online={globalStats.online} />
    </div>
  );
}
