import { useMemo } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { usePollingStore, forceRefresh } from '../../lib/stores/polling.js';
import { useAuthStore } from '../../lib/stores/auth.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { getColorHex } from '../../lib/utils.js';
import { useTabs } from '../../hooks/useTabs.js';
import { useUserAnalytics } from '../../hooks/useUserAnalytics.js';
import KeyboardHint from '../../components/KeyboardHint/KeyboardHint.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import StatusState from '../../components/StatusState/StatusState.jsx';
import {
  ShimmerText,
  SkeletonStatGrid,
  SkeletonRows,
} from '../../components/Skeleton/Skeleton.jsx';
import { summarizeList } from '../../lib/summarize.js';
import { useOverviewData } from './useOverviewData.js';
import ActivePanel from './ActivePanel.jsx';
import WorkflowPanel from './WorkflowPanel.jsx';
import PerformancePanel from './PerformancePanel.jsx';
import styles from './OverviewView.module.css';

const OVERVIEW_TABS = ['now', 'workflow', 'performance'] as const;
type OverviewTab = (typeof OVERVIEW_TABS)[number];

const TAB_LABELS: Record<OverviewTab, string> = {
  now: 'Now',
  workflow: 'Workflow',
  performance: 'Performance',
};

function summarizeNames(items: Array<{ team_id?: string; team_name?: string }>): string {
  const names = items.map((item) => item?.team_name || item?.team_id).filter(Boolean) as string[];
  return summarizeList(names);
}

export default function OverviewView() {
  const { dashboardData, dashboardStatus, pollError, pollErrorData, lastUpdate } = usePollingStore(
    useShallow((s) => ({
      dashboardData: s.dashboardData,
      dashboardStatus: s.dashboardStatus,
      pollError: s.pollError,
      pollErrorData: s.pollErrorData,
      lastUpdate: s.lastUpdate,
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

  const { activeTab, setActiveTab, hint, ref: tabRef } = useTabs(OVERVIEW_TABS);

  const knownTeamCount = teams.length;
  const hasKnownProjects = knownTeamCount > 0 || summaries.length > 0;
  const failedLabel = failedTeams.length > 0 ? summarizeNames(failedTeams) : '';

  const { totalActive, liveAgents, sortedSummaries } = useOverviewData(summaries);

  // Lazy-load analytics only when Workflow or Performance tab is selected
  const needsAnalytics = activeTab !== 'now';
  const { analytics, isLoading: analyticsLoading } = useUserAnalytics(30, needsAnalytics);

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
          <SkeletonStatGrid count={3} />
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

        <div className={styles.tabRow} ref={tabRef} role="tablist" aria-label="Overview sections">
          {OVERVIEW_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`panel-${tab}`}
              data-tab={tab}
              tabIndex={activeTab === tab ? 0 : -1}
              className={clsx(styles.tabButton, activeTab === tab && styles.tabActive)}
              onClick={(e) => {
                e.currentTarget.focus();
                setActiveTab(tab);
              }}
            >
              {TAB_LABELS[tab]}
              {activeTab === tab && <KeyboardHint {...hint} />}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.vizArea}>
        {activeTab === 'now' && (
          <ActivePanel
            summaries={sortedSummaries}
            liveAgents={liveAgents}
            selectTeam={selectTeam}
          />
        )}
        {activeTab === 'workflow' && (
          <WorkflowPanel analytics={analytics} isLoading={analyticsLoading} />
        )}
        {activeTab === 'performance' && (
          <PerformancePanel analytics={analytics} isLoading={analyticsLoading} />
        )}
      </section>
    </div>
  );
}
