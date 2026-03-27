import { useMemo, useState } from 'react';
import { usePollingStore } from '../../lib/stores/polling.js';
import { useAuthStore } from '../../lib/stores/auth.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { useToolCatalog } from '../../lib/useToolCatalog.js';
import {
  buildCategoryJoinShare,
  buildProjectStates,
  buildToolJoinShare,
  formatShare,
} from '../../lib/toolAnalytics.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import ProjectCard from '../../components/ProjectCard/ProjectCard.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import styles from './OverviewView.module.css';

export default function OverviewView() {
  const dashboardData = usePollingStore((s) => s.dashboardData);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const teamsError = useTeamStore((s) => s.teamsError);
  const summaries = dashboardData?.teams ?? [];
  const { catalog, categories, loading: catalogLoading } = useToolCatalog(token);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [sortMode, setSortMode] = useState('activity');
  const [copiedInit, setCopiedInit] = useState(false);

  const totalActive = useMemo(
    () => summaries.reduce((sum, team) => sum + (team.active_agents || 0), 0),
    [summaries]
  );
  const totalConflicts = useMemo(
    () => summaries.reduce((sum, team) => sum + (team.conflict_count || 0), 0),
    [summaries]
  );
  const totalSessions = useMemo(
    () => summaries.reduce((sum, team) => sum + (team.recent_sessions_24h || 0), 0),
    [summaries]
  );
  const hasMultipleProjects = summaries.length > 1;
  const toolShare = useMemo(() => buildToolJoinShare(summaries), [summaries]);
  const categoryShare = useMemo(
    () => buildCategoryJoinShare(toolShare, catalog, categories),
    [toolShare, catalog, categories]
  );
  const projectStates = useMemo(() => buildProjectStates(summaries), [summaries]);
  const filteredProjects = useMemo(() => {
    let items = [...summaries];
    const query = searchQuery.trim().toLowerCase();

    if (query) {
      items = items.filter((team) => {
        const name = String(team.team_name || team.team_id || '').toLowerCase();
        const tools = (team.tools_configured || [])
          .map((tool) => tool.tool)
          .join(' ')
          .toLowerCase();
        return name.includes(query) || tools.includes(query);
      });
    }

    if (filterMode === 'active') {
      items = items.filter((team) => (team.active_agents || 0) > 0);
    } else if (filterMode === 'conflicts') {
      items = items.filter((team) => (team.conflict_count || 0) > 0);
    } else if (filterMode === 'quiet') {
      items = items.filter(
        (team) => (team.active_agents || 0) === 0 && (team.conflict_count || 0) === 0
      );
    }

    items.sort((a, b) => {
      if (sortMode === 'name') {
        return String(a.team_name || a.team_id).localeCompare(String(b.team_name || b.team_id));
      }
      if (sortMode === 'sessions') {
        return (b.recent_sessions_24h || 0) - (a.recent_sessions_24h || 0);
      }
      if (sortMode === 'conflicts') {
        return (b.conflict_count || 0) - (a.conflict_count || 0);
      }

      const aScore =
        ((a.active_agents || 0) * 3) +
        ((a.conflict_count || 0) * 4) +
        (a.recent_sessions_24h || 0);
      const bScore =
        ((b.active_agents || 0) * 3) +
        ((b.conflict_count || 0) * 4) +
        (b.recent_sessions_24h || 0);
      return bScore - aScore;
    });

    return items;
  }, [summaries, searchQuery, filterMode, sortMode]);

  async function handleCopyInit() {
    try {
      await navigator.clipboard.writeText('npx chinwag init');
      setCopiedInit(true);
      window.setTimeout(() => setCopiedInit(false), 1800);
    } catch {
      // Ignore clipboard failures.
    }
  }

  return (
    <div className={styles.overview}>
      {summaries.length > 0 ? (
        <>
          <section className={styles.headerSection}>
            <div className={styles.welcomeBlock}>
              <span className={styles.sectionEyebrow}>Overview</span>
              <h1 className={styles.welcomeTitle}>
                Welcome back{user?.handle ? `, ${user.handle}` : ''}.
              </h1>
            </div>

            <div className={styles.metricsRow} aria-label="Project totals">
              <OverviewMetric label="Projects" value={summaries.length} />
              <OverviewMetric
                label="Active agents"
                value={totalActive}
                tone={totalActive > 0 ? 'accent' : 'default'}
                hint="Live now"
              />
              <OverviewMetric
                label="Conflicts"
                value={totalConflicts}
                tone={totalConflicts > 0 ? 'danger' : 'default'}
                hint="Overlapping files"
              />
              <OverviewMetric
                label="Sessions / 24h"
                value={totalSessions}
                tone={totalSessions > 0 ? 'success' : 'default'}
                hint="Reported"
              />
            </div>
          </section>

          <section className={styles.workspaceSection}>
            <div className={styles.workspaceHeader}>
              <div className={styles.workspaceCopy}>
                <h2 className={styles.workspaceTitle}>Projects</h2>
                <p className={styles.workspaceMeta}>{summaries.length} connected</p>
              </div>
              <button className={styles.commandButton} onClick={handleCopyInit}>
                {copiedInit ? 'Copied npx chinwag init' : 'Copy npx chinwag init'}
              </button>
            </div>

            {hasMultipleProjects && (
              <div className={styles.controlsRow}>
                <label className={styles.searchField}>
                  <span className={styles.searchLabel}>Search</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Project or tool"
                    aria-label="Search projects"
                  />
                </label>

                <label className={styles.selectField}>
                  <span className={styles.selectLabel}>Filter</span>
                  <select
                    value={filterMode}
                    onChange={(event) => setFilterMode(event.target.value)}
                    aria-label="Filter projects"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="conflicts">Conflicts</option>
                    <option value="quiet">Quiet</option>
                  </select>
                </label>

                <label className={styles.selectField}>
                  <span className={styles.selectLabel}>Sort</span>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value)}
                    aria-label="Sort projects"
                  >
                    <option value="activity">Most active</option>
                    <option value="sessions">Most sessions</option>
                    <option value="conflicts">Most conflicts</option>
                    <option value="name">Name</option>
                  </select>
                </label>
              </div>
            )}

            <div className={styles.insightsGrid}>
              <section className={styles.insightSection}>
                <div className={styles.insightHeader}>
                  <h2 className={styles.insightTitle}>Project states</h2>
                  <span className={styles.insightMeta}>Current</span>
                </div>
                <div className={styles.stateGrid}>
                  {projectStates.map((state) => (
                    <div key={state.id} className={styles.stateItem}>
                      <span
                        className={`${styles.stateValue} ${
                          state.id === 'active'
                            ? styles.metricAccent
                            : state.id === 'conflicts'
                              ? styles.metricDanger
                              : ''
                        }`}
                      >
                        {state.value}
                      </span>
                      <span className={styles.stateLabel}>{state.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.insightSection}>
                <div className={styles.insightHeader}>
                  <h2 className={styles.insightTitle}>Tool mix</h2>
                  <span className={styles.insightMeta}>Recorded joins</span>
                </div>
                <div className={styles.toolMixGrid}>
                  <div className={styles.dataGroup}>
                    <span className={styles.dataGroupTitle}>By tool</span>
                    {toolShare.length > 0 ? (
                      <div className={styles.dataList}>
                        {toolShare.slice(0, 3).map((tool) => (
                          <div key={tool.tool} className={styles.dataRow}>
                            <span className={styles.dataLabel}>{getToolMeta(tool.tool).label}</span>
                            <span className={styles.dataValue}>{formatShare(tool.share)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.emptyHint}>No recorded joins yet.</p>
                    )}
                  </div>

                  <div className={styles.dataGroup}>
                    <span className={styles.dataGroupTitle}>By category</span>
                    {categoryShare.length > 0 ? (
                      <div className={styles.dataList}>
                        {categoryShare.slice(0, 3).map((category) => (
                          <div key={category.id} className={styles.dataRow}>
                            <span className={styles.dataLabel}>{category.label}</span>
                            <span className={styles.dataValue}>{formatShare(category.share)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.emptyHint}>
                        {catalogLoading ? 'Loading categories...' : 'No category data yet.'}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {filteredProjects.length === 0 ? (
              <EmptyState title="No matching projects" hint="Try a different search, filter, or sort." />
            ) : !hasMultipleProjects && !searchQuery && filterMode === 'all' ? (
              <div className={styles.featuredProjectWrap}>
                <ProjectCard team={filteredProjects[0]} featured={true} />
              </div>
            ) : (
              <div className={styles.overviewGrid} role="list" aria-label="Projects">
                {filteredProjects.map((team) => (
                  <div key={team.team_id} role="listitem">
                    <ProjectCard team={team} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <EmptyState
          large={true}
          title={teamsError ? 'Could not load projects' : 'No projects yet'}
          hint={teamsError || <>Run <code>npx chinwag init</code> in a repo to add one.</>}
        />
      )}
    </div>
  );
}

function OverviewMetric({ label, value, tone = 'default', hint = '' }) {
  return (
    <div className={styles.metricItem}>
      <span className={styles.metricLabel}>{label}</span>
      <span
        className={`${styles.metricValue} ${
          tone === 'accent'
            ? styles.metricAccent
            : tone === 'danger'
              ? styles.metricDanger
              : tone === 'success'
                ? styles.metricSuccess
                : ''
        }`}
      >
        {value}
      </span>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </div>
  );
}
