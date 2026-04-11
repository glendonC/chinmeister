import { type CSSProperties } from 'react';
import clsx from 'clsx';
import { getToolMeta } from '../../../lib/toolMeta.js';
import { formatDuration } from '../../../lib/utils.js';
import type {
  MemberAnalytics,
  ConcurrentEditEntry,
  FileOverlapStats,
  ConflictCorrelation,
  RetryPattern,
  OutcomeTagCount,
} from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function MemberSection({ members }: { members: MemberAnalytics[] }) {
  if (members.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Team members</span>
      <div className={styles.dataList}>
        {members.map((m, i) => {
          const meta = m.primary_tool ? getToolMeta(m.primary_tool) : null;
          return (
            <div
              key={m.handle}
              className={styles.dataRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.dataName}>
                {m.handle}
                {meta && (
                  <span className={styles.dataStat} style={{ marginLeft: 8 }}>
                    {meta.label}
                  </span>
                )}
              </span>
              <div className={styles.dataMeta}>
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>{m.completion_rate}%</span> rate
                </span>
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>{m.sessions}</span> sessions
                </span>
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>{formatDuration(m.avg_duration_min)}</span>{' '}
                  avg
                </span>
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>{m.total_edits.toLocaleString()}</span>{' '}
                  edits
                </span>
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>
                    {(m.total_lines_added + m.total_lines_removed).toLocaleString()}
                  </span>{' '}
                  lines
                </span>
                {m.completed > 0 && (
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatSuccess}>{m.completed}</span> done
                  </span>
                )}
                {m.abandoned > 0 && (
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatWarn}>{m.abandoned}</span> left
                  </span>
                )}
                {m.failed > 0 && (
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatDanger}>{m.failed}</span> failed
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

export function ConcurrentEditsSection({ edits }: { edits: ConcurrentEditEntry[] }) {
  if (edits.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Multi-agent files</span>
      <div className={styles.dataList}>
        {edits.slice(0, 15).map((e, i) => (
          <div
            key={e.file}
            className={styles.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.dataName} title={e.file}>
              {e.file.split('/').slice(-2).join('/')}
            </span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{e.agents}</span> agents
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{e.edit_count}</span> edits
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FileOverlapSection({ overlap }: { overlap: FileOverlapStats }) {
  if (overlap.total_files === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>File overlap</span>
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{overlap.overlap_rate}%</span>
          <span className={styles.statBlockLabel}>files shared</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{overlap.overlapping_files}</span>
          <span className={styles.statBlockLabel}>overlapping</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{overlap.total_files}</span>
          <span className={styles.statBlockLabel}>total files</span>
        </div>
      </div>
    </div>
  );
}

export function ConflictCorrelationSection({ data }: { data: ConflictCorrelation[] }) {
  if (data.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Conflict impact</span>
      <div className={styles.compareRow}>
        {data.map((d) => (
          <div key={d.bucket} className={styles.compareBlock}>
            <span className={styles.compareValue}>{d.completion_rate}%</span>
            <span className={styles.compareLabel}>
              {d.bucket} ({d.sessions})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RetryPatternsSection({ retries }: { retries: RetryPattern[] }) {
  if (retries.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Retry patterns</span>
      <div className={styles.dataList}>
        {retries.slice(0, 15).map((r, i) => (
          <div
            key={`${r.handle}-${r.file}`}
            className={styles.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.dataName} title={r.file}>
              <span style={{ fontWeight: 600 }}>{r.handle}</span>{' '}
              {r.file.split('/').slice(-2).join('/')}
            </span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{r.attempts}</span> attempts
              </span>
              <span className={styles.dataStat}>
                <span className={r.resolved ? styles.dataStatSuccess : styles.dataStatDanger}>
                  {r.resolved ? 'resolved' : r.final_outcome || 'unresolved'}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OutcomeTagsSection({ data }: { data: OutcomeTagCount[] }) {
  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Failure reasons</span>
      <div className={styles.metricBars}>
        {data.slice(0, 15).map((d) => {
          const pct = (d.count / maxCount) * 100;
          return (
            <div key={`${d.tag}-${d.outcome}`} className={styles.metricRow}>
              <span className={styles.metricLabel} title={d.tag}>
                {d.tag}
              </span>
              <div className={styles.metricBarTrack}>
                <div
                  className={clsx(
                    styles.metricBarFill,
                    d.outcome === 'failed' && styles.metricBarDanger,
                    d.outcome === 'abandoned' && styles.metricBarWarn,
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={styles.metricValue}>{d.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
