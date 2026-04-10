import type { CSSProperties } from 'react';
import clsx from 'clsx';
import { WORK_TYPE_COLORS } from '../overview-utils.js';
import { formatDuration } from '../../../lib/utils.js';
import type {
  WorkTypeDistribution,
  WorkTypeOutcome,
  ScopeComplexityBucket,
} from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function WorkTypeSection({ workTypes }: { workTypes: WorkTypeDistribution[] }) {
  if (workTypes.length === 0) return null;

  const totalSessions = workTypes.reduce((s, w) => s + w.sessions, 0);
  if (totalSessions === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>What you&apos;re building</span>
      <div className={styles.workBar}>
        {workTypes.map((w) => {
          const pct = (w.sessions / totalSessions) * 100;
          if (pct < 1) return null;
          return (
            <div
              key={w.work_type}
              className={styles.workSegment}
              style={{
                width: `${pct}%`,
                background: WORK_TYPE_COLORS[w.work_type] || WORK_TYPE_COLORS.other,
              }}
              title={`${w.work_type}: ${Math.round(pct)}%`}
            />
          );
        })}
      </div>
      <div className={styles.workLegend}>
        {workTypes.map((w) => {
          const pct = Math.round((w.sessions / totalSessions) * 100);
          if (pct < 1) return null;
          return (
            <div key={w.work_type} className={styles.workLegendItem}>
              <span
                className={styles.workDot}
                style={{ background: WORK_TYPE_COLORS[w.work_type] || WORK_TYPE_COLORS.other }}
              />
              <span className={styles.workLegendLabel}>{w.work_type}</span>
              <span className={styles.workLegendValue}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkTypeOutcomesSection({ outcomes }: { outcomes: WorkTypeOutcome[] }) {
  if (outcomes.length === 0) return null;

  const maxSessions = Math.max(...outcomes.map((o) => o.sessions), 1);

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Completion by work type</span>
      <div className={styles.metricBars}>
        {outcomes.map((o) => {
          const pct = (o.sessions / maxSessions) * 100;
          return (
            <div key={o.work_type} className={styles.metricRow}>
              <span className={styles.metricLabel}>{o.work_type}</span>
              <div className={styles.metricBarTrack}>
                <div
                  className={clsx(
                    styles.metricBarFill,
                    o.completion_rate < 50 && styles.metricBarWarn,
                  )}
                  style={{
                    width: `${pct}%`,
                    background: WORK_TYPE_COLORS[o.work_type] || WORK_TYPE_COLORS.other,
                    opacity: 0.5,
                  }}
                />
              </div>
              <span className={styles.metricValue}>{o.completion_rate}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScopeComplexitySection({ data }: { data: ScopeComplexityBucket[] }) {
  if (data.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Task scope vs outcome</span>
      <div className={styles.dataList}>
        {data.map((d, i) => (
          <div
            key={d.bucket}
            className={styles.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.dataName}>{d.bucket}</span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span
                  className={d.completion_rate < 50 ? styles.dataStatDanger : styles.dataStatValue}
                >
                  {d.completion_rate}%
                </span>{' '}
                completed
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{d.sessions}</span> sessions
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{d.avg_edits}</span> avg edits
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{formatDuration(d.avg_duration_min)}</span>{' '}
                avg
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
