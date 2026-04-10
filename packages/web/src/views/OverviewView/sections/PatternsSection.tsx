import { useMemo } from 'react';
import clsx from 'clsx';
import { DAY_LABELS, buildHeatmapData } from '../overview-utils.js';
import type { HourlyBucket, DurationBucket } from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function PatternsSection({
  hourly,
  duration,
}: {
  hourly: HourlyBucket[];
  duration: DurationBucket[];
}) {
  const { grid, max } = useMemo(() => buildHeatmapData(hourly), [hourly]);
  const maxCount = useMemo(() => Math.max(...duration.map((d) => d.count), 1), [duration]);

  const hasHeatmap = hourly.length > 0;
  const hasDuration = duration.some((d) => d.count > 0);
  if (!hasHeatmap && !hasDuration) return null;

  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>How you work</span>
      <div className={styles.twoCol}>
        {hasHeatmap && (
          <div className={styles.colBlock}>
            <div className={styles.heatmapWrap}>
              <div className={styles.heatmapGrid}>
                <div className={styles.heatmapYLabels}>
                  {DAY_LABELS.map((d) => (
                    <span key={d} className={styles.heatmapYLabel}>
                      {d}
                    </span>
                  ))}
                </div>
                <div className={styles.heatmapCols}>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={hour} className={styles.heatmapCol}>
                      {Array.from({ length: 7 }, (_, dow) => {
                        const val = grid[dow][hour];
                        const opacity = max > 0 ? 0.05 + (val / max) * 0.7 : 0.05;
                        return (
                          <div
                            key={dow}
                            className={styles.heatmapCell}
                            style={{ background: `var(--accent)`, opacity }}
                            title={`${DAY_LABELS[dow]} ${hour}:00 - ${val} sessions`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.heatmapXLabels}>
                {hourLabels.map((h) => (
                  <span key={h} className={styles.heatmapXLabel}>
                    {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {hasDuration && (
          <div className={styles.colBlock}>
            <div className={styles.durationBars}>
              {duration.map((d) => {
                const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                const isPeak = d.count === maxCount && maxCount > 0;
                return (
                  <div key={d.bucket} className={styles.durationRow}>
                    <span className={styles.durationLabel}>{d.bucket}</span>
                    <div className={styles.durationBarTrack}>
                      <div
                        className={clsx(styles.durationBarFill, isPeak && styles.durationBarPeak)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={styles.durationCount}>{d.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
