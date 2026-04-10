import type { CSSProperties } from 'react';
import { getToolMeta } from '../../../lib/toolMeta.js';
import { formatDuration } from '../../../lib/utils.js';
import styles from '../OverviewView.module.css';

export function LiveAgentsBar({
  liveAgents,
  selectTeam,
}: {
  liveAgents: Array<{
    handle: string;
    host_tool: string;
    session_minutes: number | null;
    teamId: string;
  }>;
  selectTeam: (id: string) => void;
}) {
  if (liveAgents.length === 0) return null;
  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Live now</span>
      <div className={styles.liveBar}>
        {liveAgents.map((a, i) => {
          const meta = getToolMeta(a.host_tool);
          return (
            <button
              key={`${a.handle}-${i}`}
              className={styles.liveAgent}
              onClick={() => selectTeam(a.teamId)}
              type="button"
            >
              <span className={styles.liveDot} style={{ background: meta.color }} />
              <span className={styles.liveHandle}>{a.handle}</span>
              <span className={styles.liveMeta}>{meta.label}</span>
              {a.session_minutes != null && a.session_minutes > 0 && (
                <span className={styles.liveDuration}>{formatDuration(a.session_minutes)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProjectsSection({
  summaries,
  liveAgents,
  selectTeam,
}: {
  summaries: Array<Record<string, unknown>>;
  liveAgents: Array<{ teamId: string }>;
  selectTeam: (id: string) => void;
}) {
  if (summaries.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Projects</span>
      <div className={styles.projectList}>
        {summaries.map((team, i) => {
          const teamId = (team.team_id as string) || '';
          const name = (team.team_name as string) || teamId;
          const sessions24h = (team.recent_sessions_24h as number) || 0;
          const conflicts = (team.conflict_count as number) || 0;
          const live = liveAgents.filter((a) => a.teamId === teamId).length;

          return (
            <button
              key={teamId}
              className={styles.projectRow}
              style={{ '--row-index': i } as CSSProperties}
              onClick={() => selectTeam(teamId)}
              type="button"
            >
              <span className={styles.projectName}>{name}</span>
              <div className={styles.projectMeta}>
                <span className={styles.projectStat}>{sessions24h} sessions today</span>
                {live > 0 && (
                  <span className={styles.projectLive}>
                    <span className={styles.liveDot} style={{ background: 'var(--accent)' }} />
                    {live} live
                  </span>
                )}
                {conflicts > 0 && (
                  <span className={styles.projectConflict}>{conflicts} conflicts</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
