import { useMemo } from 'react';
import { usePollingStore } from '../../lib/stores/polling.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import ProjectCard from '../../components/ProjectCard/ProjectCard.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import styles from './OverviewView.module.css';

export default function OverviewView() {
  const dashboardData = usePollingStore((s) => s.dashboardData);
  const teamsError = useTeamStore((s) => s.teamsError);
  const summaries = dashboardData?.teams ?? [];

  const totalActive = useMemo(
    () => summaries.reduce((sum, t) => sum + (t.active_agents || 0), 0),
    [summaries]
  );
  const totalConflicts = useMemo(
    () => summaries.reduce((sum, t) => sum + (t.conflict_count || 0), 0),
    [summaries]
  );
  const totalMemories = useMemo(
    () => summaries.reduce((sum, t) => sum + (t.memory_count || 0), 0),
    [summaries]
  );
  const totalSessions = useMemo(
    () => summaries.reduce((sum, t) => sum + (t.recent_sessions_24h || 0), 0),
    [summaries]
  );

  return (
    <div className={styles.overview}>
      {summaries.length > 0 ? (
        <>
          <div className={styles.hero}>
            <div className={styles.heroStat}>
              <span className={styles.heroLabel}>Active agents</span>
              <span className={`${styles.heroValue} ${totalActive > 0 ? styles.heroActive : ''}`}>
                {totalActive}
              </span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroLabel}>Projects</span>
              <span className={styles.heroValue}>{summaries.length}</span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroLabel}>Conflicts</span>
              <span className={`${styles.heroValue} ${totalConflicts > 0 ? styles.heroDanger : ''}`}>
                {totalConflicts}
              </span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroLabel}>Sessions 24h</span>
              <span className={styles.heroValue}>{totalSessions}</span>
            </div>
          </div>

          <div className={styles.gridHeader}>
            <h2 className={styles.gridTitle}>Projects</h2>
          </div>
          <div className={styles.overviewGrid} role="list" aria-label="Projects">
            {summaries.map((team) => (
              <div key={team.team_id} role="listitem">
                <ProjectCard team={team} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          large={true}
          title={teamsError ? 'Could not load projects' : 'No projects yet'}
          hint={teamsError || <>Run <code>npx chinwag init</code> in a project to get started</>}
        />
      )}
    </div>
  );
}
