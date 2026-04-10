import { getToolMeta } from '../../../lib/toolMeta.js';
import { formatDuration } from '../../../lib/utils.js';
import type { StucknessStats, FirstEditStats } from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function StucknessSection({ stuckness }: { stuckness: StucknessStats }) {
  if (stuckness.total_sessions === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Session health</span>
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{stuckness.stuckness_rate}%</span>
          <span className={styles.statBlockLabel}>got stuck</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{stuckness.stuck_sessions}</span>
          <span className={styles.statBlockLabel}>stuck sessions</span>
        </div>
        {stuckness.stuck_sessions > 0 && (
          <div className={styles.statBlock}>
            <span className={styles.statBlockValue}>{stuckness.stuck_completion_rate}%</span>
            <span className={styles.statBlockLabel}>stuck completed</span>
          </div>
        )}
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{stuckness.normal_completion_rate}%</span>
          <span className={styles.statBlockLabel}>normal completed</span>
        </div>
      </div>
    </div>
  );
}

export function FirstEditSection({ stats }: { stats: FirstEditStats }) {
  if (stats.avg_minutes_to_first_edit === 0 && stats.by_tool.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Agent warmup</span>
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>
            {formatDuration(stats.avg_minutes_to_first_edit)}
          </span>
          <span className={styles.statBlockLabel}>avg to first edit</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>
            {formatDuration(stats.median_minutes_to_first_edit)}
          </span>
          <span className={styles.statBlockLabel}>median</span>
        </div>
      </div>
      {stats.by_tool.length > 1 && (
        <div className={styles.metricBars} style={{ marginTop: 16 }}>
          {stats.by_tool.map((t) => {
            const max = Math.max(...stats.by_tool.map((x) => x.avg_minutes), 1);
            const pct = (t.avg_minutes / max) * 100;
            const meta = getToolMeta(t.host_tool);
            return (
              <div key={t.host_tool} className={styles.metricRow}>
                <span className={styles.metricLabel}>{meta.label}</span>
                <div className={styles.metricBarTrack}>
                  <div className={styles.metricBarFill} style={{ width: `${pct}%` }} />
                </div>
                <span className={styles.metricValue}>
                  {formatDuration(t.avg_minutes)} ({t.sessions})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
