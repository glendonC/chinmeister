import type { CSSProperties } from 'react';
import { RingChart } from '../overview-charts.js';
import { WORK_TYPE_COLORS } from '../overview-utils.js';
import { getToolMeta } from '../../../lib/toolMeta.js';
import { formatDuration } from '../../../lib/utils.js';
import type {
  ToolComparison,
  ToolHandoff,
  ToolOutcome,
  ToolWorkTypeBreakdown,
} from '../../../lib/apiSchemas.js';
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

export function ToolOutcomesSection({ data }: { data: ToolOutcome[] }) {
  if (data.length === 0) return null;

  const byTool = new Map<string, { completed: number; abandoned: number; failed: number }>();
  for (const d of data) {
    const entry = byTool.get(d.host_tool) || { completed: 0, abandoned: 0, failed: 0 };
    if (d.outcome === 'completed') entry.completed = d.count;
    else if (d.outcome === 'abandoned') entry.abandoned = d.count;
    else if (d.outcome === 'failed') entry.failed = d.count;
    byTool.set(d.host_tool, entry);
  }

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Tool outcome breakdown</span>
      <div className={styles.dataList}>
        {[...byTool.entries()].map(([tool, counts], i) => {
          const meta = getToolMeta(tool);
          const total = counts.completed + counts.abandoned + counts.failed;
          return (
            <div
              key={tool}
              className={styles.dataRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.dataName}>{meta.label}</span>
              <div className={styles.dataMeta}>
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>{total}</span> total
                </span>
                {counts.completed > 0 && (
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatSuccess}>{counts.completed}</span> done
                  </span>
                )}
                {counts.abandoned > 0 && (
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatWarn}>{counts.abandoned}</span> left
                  </span>
                )}
                {counts.failed > 0 && (
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatDanger}>{counts.failed}</span> failed
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

export function ToolWorkTypeSection({ data }: { data: ToolWorkTypeBreakdown[] }) {
  if (data.length === 0) return null;

  const byTool = new Map<string, Array<{ work_type: string; sessions: number; edits: number }>>();
  for (const d of data) {
    const arr = byTool.get(d.host_tool) || [];
    arr.push({ work_type: d.work_type, sessions: d.sessions, edits: d.edits });
    byTool.set(d.host_tool, arr);
  }

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Tool specialization</span>
      {[...byTool.entries()].map(([tool, types]) => {
        const meta = getToolMeta(tool);
        const totalSessions = types.reduce((s, t) => s + t.sessions, 0);
        if (totalSessions === 0) return null;
        return (
          <div key={tool} style={{ marginBottom: 16 }}>
            <span className={styles.sectionSublabel}>{meta.label}</span>
            <div className={styles.workBar}>
              {types.map((t) => {
                const pct = (t.sessions / totalSessions) * 100;
                if (pct < 1) return null;
                return (
                  <div
                    key={t.work_type}
                    className={styles.workSegment}
                    style={{
                      width: `${pct}%`,
                      background: WORK_TYPE_COLORS[t.work_type] || WORK_TYPE_COLORS.other,
                    }}
                    title={`${t.work_type}: ${Math.round(pct)}%`}
                  />
                );
              })}
            </div>
            <div className={styles.workLegend}>
              {types.map((t) => {
                const pct = Math.round((t.sessions / totalSessions) * 100);
                if (pct < 1) return null;
                return (
                  <div key={t.work_type} className={styles.workLegendItem}>
                    <span
                      className={styles.workDot}
                      style={{
                        background: WORK_TYPE_COLORS[t.work_type] || WORK_TYPE_COLORS.other,
                      }}
                    />
                    <span className={styles.workLegendLabel}>{t.work_type}</span>
                    <span className={styles.workLegendValue}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
