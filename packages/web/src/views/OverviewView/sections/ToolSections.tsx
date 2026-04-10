import type { CSSProperties } from 'react';
import { RingChart } from '../overview-charts.js';
import { getToolMeta } from '../../../lib/toolMeta.js';
import { formatDuration } from '../../../lib/utils.js';
import type { ToolComparison, ToolHandoff } from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function ToolComparisonSection({ tools }: { tools: ToolComparison[] }) {
  if (tools.length === 0) return null;
  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Tool effectiveness</span>
      <div className={styles.toolGrid}>
        {tools.map((t, i) => {
          const meta = getToolMeta(t.host_tool);
          return (
            <div
              key={t.host_tool}
              className={styles.toolColumn}
              style={{ '--col-index': i } as CSSProperties}
            >
              <div className={styles.toolName}>
                {meta.icon ? (
                  <span className={styles.toolIcon}>
                    <img src={meta.icon} alt="" />
                  </span>
                ) : (
                  <span className={styles.toolIconLetter} style={{ background: meta.color }}>
                    {meta.label[0]}
                  </span>
                )}
                <span className={styles.toolLabel}>{meta.label}</span>
              </div>
              <div className={styles.toolRingRow}>
                <RingChart
                  completed={t.completed}
                  abandoned={t.abandoned}
                  failed={t.failed}
                  size={44}
                  stroke={3.5}
                />
                <div>
                  <span className={styles.toolRate}>{t.completion_rate}</span>
                  <span className={styles.toolRateUnit}>%</span>
                </div>
              </div>
              <div className={styles.toolStats}>
                <span className={styles.toolStat}>
                  <span className={styles.toolStatValue}>{formatDuration(t.avg_duration_min)}</span>{' '}
                  avg
                </span>
                <span className={styles.toolStat}>
                  <span className={styles.toolStatValue}>{t.sessions}</span> sessions
                </span>
                <span className={styles.toolStat}>
                  <span className={styles.toolStatValue}>
                    {(t.total_lines_added + t.total_lines_removed).toLocaleString()}
                  </span>{' '}
                  lines
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ToolHandoffsSection({ data }: { data: ToolHandoff[] }) {
  if (data.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Cross-tool handoffs</span>
      <div className={styles.dataList}>
        {data.map((d, i) => {
          const fromMeta = getToolMeta(d.from_tool);
          const toMeta = getToolMeta(d.to_tool);
          return (
            <div
              key={`${d.from_tool}-${d.to_tool}`}
              className={styles.dataRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.dataName}>
                {fromMeta.label} → {toMeta.label}
              </span>
              <div className={styles.dataMeta}>
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>{d.file_count}</span> files
                </span>
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>{d.handoff_completion_rate}%</span>{' '}
                  completed
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
