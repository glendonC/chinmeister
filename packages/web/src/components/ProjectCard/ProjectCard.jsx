import { useTeamStore } from '../../lib/stores/teams.js';
import StatCard from '../StatCard/StatCard.jsx';
import styles from './ProjectCard.module.css';

export default function ProjectCard({ team }) {
  const selectTeam = useTeamStore((s) => s.selectTeam);

  function handleClick() {
    selectTeam(team.team_id);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <article
      className={styles.card}
      tabIndex={0}
      role="button"
      aria-label={`Open project ${team.team_name}`}
      onClick={handleClick}
      onKeyDown={handleKeydown}
    >
      <div className={styles.cardHeader}>
        <h3 className={styles.cardName}>{team.team_name}</h3>
        <div className={styles.cardIndicators}>
          {team.active_agents > 0 && (
            <span className={styles.indicatorActive} aria-label={`${team.active_agents} active agents`}>
              <span className={styles.indicatorDot} />
              {team.active_agents} active
            </span>
          )}
          {team.conflict_count > 0 && (
            <span className={styles.indicatorConflict} aria-label={`${team.conflict_count} conflicts`}>
              {team.conflict_count} conflict{team.conflict_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className={styles.cardStats}>
        <StatCard value={team.active_agents} label="agents" variant={team.active_agents > 0 ? 'active' : 'default'} />
        <StatCard value={team.live_sessions} label="sessions" />
        <StatCard value={team.memory_count} label="memories" />
        <StatCard value={team.recent_sessions_24h} label="24h" />
      </div>
    </article>
  );
}
