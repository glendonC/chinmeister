import { useTeamStore } from '../../lib/stores/teams.js';
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
            <span className={styles.indicatorActive}>
              <span className={styles.indicatorDot} />
              {team.active_agents} active
            </span>
          )}
          {team.conflict_count > 0 && (
            <span className={styles.indicatorConflict}>
              {team.conflict_count} conflict{team.conflict_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className={styles.cardStats}>
        <div className={styles.cardStat}>
          <span className={styles.cardStatValue}>{team.active_agents}</span>
          <span className={styles.cardStatLabel}>agents</span>
        </div>
        <div className={styles.cardStat}>
          <span className={styles.cardStatValue}>{team.live_sessions}</span>
          <span className={styles.cardStatLabel}>sessions</span>
        </div>
        <div className={styles.cardStat}>
          <span className={styles.cardStatValue}>{team.memory_count}</span>
          <span className={styles.cardStatLabel}>memories</span>
        </div>
        <div className={styles.cardStat}>
          <span className={styles.cardStatValue}>{team.recent_sessions_24h}</span>
          <span className={styles.cardStatLabel}>24h</span>
        </div>
      </div>

      {team.tools_configured?.length > 0 && (
        <div className={styles.cardTools}>
          {team.tools_configured.map((t) => (
            <span key={t.tool} className={styles.toolChip}>{t.tool}</span>
          ))}
        </div>
      )}
    </article>
  );
}
