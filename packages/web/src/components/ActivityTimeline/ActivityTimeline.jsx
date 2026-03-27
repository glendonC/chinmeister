import { useMemo } from 'react';
import styles from './ActivityTimeline.module.css';
import { BIN_COUNT, buildTimelineBins } from './timelineBins.js';

export default function ActivityTimeline({ sessions = [], liveCount = 0 }) {
  const bins = useMemo(() => buildTimelineBins(sessions, liveCount), [sessions, liveCount]);
  const max = Math.max(...bins, 1);
  const hasActivity = bins.some((value) => value > 0);

  if (!hasActivity) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTrack}>
          {Array.from({ length: BIN_COUNT }).map((_, index) => (
            <span key={index} className={styles.emptyTick} />
          ))}
        </div>
        <p className={styles.emptyLabel}>No recent session activity yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.timeline}>
      <div className={styles.chart} aria-hidden="true">
        {bins.map((value, index) => {
          const height = 12 + Math.round((value / max) * 58);
          const isCurrent = index === BIN_COUNT - 1;
          return (
            <span key={index} className={styles.column}>
              <span
                className={`${styles.bar} ${isCurrent ? styles.barCurrent : ''}`}
                style={{ height }}
              />
            </span>
          );
        })}
      </div>

      <div className={styles.footer}>
        <span className={styles.rangeLabel}>24h ago</span>
        <div className={styles.legend}>
          <span className={styles.legendDot} />
          <span className={styles.legendText}>{liveCount} live now</span>
        </div>
        <span className={styles.rangeLabel}>Now</span>
      </div>
    </div>
  );
}
