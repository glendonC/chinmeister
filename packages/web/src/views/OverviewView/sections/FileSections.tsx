import { type CSSProperties } from 'react';
import clsx from 'clsx';
import type {
  FileHeatmapEntry,
  DirectoryHeatmapEntry,
  FileChurnEntry,
  FileReworkEntry,
  AuditStalenessEntry,
} from '../../../lib/apiSchemas.js';
import { WORK_TYPE_COLORS } from '../overview-utils.js';
import styles from '../OverviewView.module.css';

export function FileHeatmapSection({ files }: { files: FileHeatmapEntry[] }) {
  if (files.length === 0) return null;

  const maxTouches = Math.max(...files.map((f) => f.touch_count), 1);

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>File heatmap</span>
      <div className={styles.dataList}>
        {files.slice(0, 20).map((f, i) => {
          const pct = (f.touch_count / maxTouches) * 100;
          return (
            <div
              key={f.file}
              className={styles.dataRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.dataName} title={f.file}>
                {f.file.split('/').slice(-2).join('/')}
              </span>
              <div className={styles.dataMeta}>
                {f.work_type && (
                  <span className={styles.dataStat}>
                    <span
                      className={styles.workDot}
                      style={{
                        background: WORK_TYPE_COLORS[f.work_type] || WORK_TYPE_COLORS.other,
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: 2,
                        marginRight: 4,
                      }}
                    />
                    {f.work_type}
                  </span>
                )}
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>{f.touch_count}</span> touches
                </span>
                {f.total_lines_added != null && f.total_lines_removed != null && (
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatValue}>
                      +{f.total_lines_added}/-{f.total_lines_removed}
                    </span>
                  </span>
                )}
                {f.outcome_rate != null && (
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatValue}>{f.outcome_rate}%</span> completed
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DirectoryHeatmapSection({ dirs }: { dirs: DirectoryHeatmapEntry[] }) {
  if (dirs.length === 0) return null;

  const maxTouches = Math.max(...dirs.map((d) => d.touch_count), 1);

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Directory heatmap</span>
      <div className={styles.metricBars}>
        {dirs.slice(0, 15).map((d) => {
          const pct = (d.touch_count / maxTouches) * 100;
          return (
            <div key={d.directory} className={styles.metricRow}>
              <span className={styles.metricLabel} title={d.directory}>
                {d.directory}
              </span>
              <div className={styles.metricBarTrack}>
                <div className={styles.metricBarFill} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.metricValue}>{d.touch_count}</span>
              <span
                className={clsx(
                  styles.metricValue,
                  d.completion_rate >= 70 && styles.dataStatSuccess,
                  d.completion_rate < 50 && styles.dataStatWarn,
                )}
              >
                {d.completion_rate.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FileChurnSection({ churn }: { churn: FileChurnEntry[] }) {
  if (churn.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>High-churn files</span>
      <div className={styles.dataList}>
        {churn.slice(0, 15).map((f, i) => (
          <div
            key={f.file}
            className={styles.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.dataName} title={f.file}>
              {f.file.split('/').slice(-2).join('/')}
            </span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{f.session_count}</span> sessions
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{f.total_edits}</span> edits
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{f.total_lines.toLocaleString()}</span> lines
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FileReworkSection({ rework }: { rework: FileReworkEntry[] }) {
  if (rework.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>File rework</span>
      <div className={styles.dataList}>
        {rework.slice(0, 15).map((f, i) => (
          <div
            key={f.file}
            className={styles.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.dataName} title={f.file}>
              {f.file.split('/').slice(-2).join('/')}
            </span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatDanger}>{f.rework_ratio}%</span> rework
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{f.failed_edits}</span>/{f.total_edits}{' '}
                failed
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuditStalenessSection({ stale }: { stale: AuditStalenessEntry[] }) {
  if (stale.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Audit staleness</span>
      <div className={styles.dataList}>
        {stale.map((s, i) => (
          <div
            key={s.directory}
            className={styles.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.dataName}>{s.directory}</span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatWarn}>{s.days_since}d</span> since last edit
              </span>
              <span className={styles.dataStat}>{new Date(s.last_edit).toLocaleDateString()}</span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{s.prior_edit_count}</span> prior edits
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
