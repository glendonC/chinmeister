import { type CSSProperties } from 'react';
import clsx from 'clsx';
import type { ToolCallStats } from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallOverviewSection({ stats }: { stats: ToolCallStats }) {
  if (stats.total_calls === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Tool call activity</span>
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{stats.total_calls.toLocaleString()}</span>
          <span className={styles.statBlockLabel}>total calls</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{stats.total_errors.toLocaleString()}</span>
          <span className={styles.statBlockLabel}>errors</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{stats.error_rate}%</span>
          <span className={styles.statBlockLabel}>error rate</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{fmtMs(stats.avg_duration_ms)}</span>
          <span className={styles.statBlockLabel}>avg duration</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{stats.calls_per_session.toFixed(1)}</span>
          <span className={styles.statBlockLabel}>calls / session</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{stats.research_to_edit_ratio.toFixed(1)}:1</span>
          <span className={styles.statBlockLabel}>research : edit</span>
        </div>
      </div>
    </div>
  );
}

export function ToolCallFrequencySection({ stats }: { stats: ToolCallStats }) {
  if (stats.frequency.length === 0) return null;

  const maxCalls = Math.max(...stats.frequency.map((f) => f.calls), 1);

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Tool call breakdown</span>
      <div className={styles.metricBars}>
        {stats.frequency.map((f) => {
          const pct = (f.calls / maxCalls) * 100;
          return (
            <div key={f.tool} className={styles.metricRow}>
              <span className={styles.metricLabel}>{f.tool}</span>
              <div className={styles.metricBarTrack}>
                <div
                  className={clsx(
                    styles.metricBarFill,
                    f.error_rate > 40 && styles.metricBarDanger,
                    f.error_rate > 20 && f.error_rate <= 40 && styles.metricBarWarn,
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={styles.metricValue}>{f.calls}</span>
              {f.error_rate > 0 && <span className={styles.metricValue}>{f.error_rate}% err</span>}
              {f.avg_duration_ms > 0 && (
                <span className={styles.metricValue}>{fmtMs(f.avg_duration_ms)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ToolCallErrorsSection({ stats }: { stats: ToolCallStats }) {
  if (stats.error_patterns.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Common tool errors</span>
      <div className={styles.dataList}>
        {stats.error_patterns.map((e, i) => (
          <div
            key={`${e.tool}-${i}`}
            className={styles.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.dataName} title={e.error_preview}>
              <span style={{ fontWeight: 600 }}>{e.tool}</span>{' '}
              {e.error_preview.length > 80
                ? e.error_preview.slice(0, 80) + '\u2026'
                : e.error_preview}
            </span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatDanger}>{e.count}</span> occurrences
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
