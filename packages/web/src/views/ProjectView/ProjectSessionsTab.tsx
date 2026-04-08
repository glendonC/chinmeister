import { type CSSProperties } from 'react';
import type { Session, TeamAnalytics, EditEntry } from '../../lib/apiSchemas.js';
import type { OutcomeBreakdown, LineStats } from './projectViewState.js';
import { formatRelativeTime } from '../../lib/relativeTime.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.jsx';
import SessionRow from '../../components/SessionRow/SessionRow.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import SummaryStat from './SummaryStat.jsx';
import styles from './ProjectView.module.css';

type SessionWithId = Session & { id?: string };

interface ProjectSessionsTabProps {
  sessions: SessionWithId[];
  sessionEditCount: number;
  filesTouched: string[];
  filesTouchedCount: number;
  liveSessionCount: number;
  outcomeBreakdown: OutcomeBreakdown;
  lineStats: LineStats;
  analytics: TeamAnalytics;
  analyticsLoading: boolean;
  edits: EditEntry[];
}

export default function ProjectSessionsTab({
  sessions,
  sessionEditCount,
  filesTouched,
  filesTouchedCount,
  liveSessionCount,
  outcomeBreakdown,
  lineStats,
  analytics,
  analyticsLoading: _analyticsLoading,
  edits,
}: ProjectSessionsTabProps) {
  const hasFiles = filesTouched.length > 0;
  const hasLines = lineStats.added > 0 || lineStats.removed > 0;
  const hasHeatmap = analytics.file_heatmap.length > 0;
  const hasTrends = analytics.daily_trends.length > 0;
  const hasToolDist = analytics.tool_distribution.length > 0;
  const hasEdits = edits.length > 0;

  if (sessions.length === 0 && !hasHeatmap && !hasTrends) {
    return <EmptyState title="No recent sessions" hint="Reported sessions appear here." />;
  }

  return (
    <div className={styles.panelGrid}>
      <div>
        {/* Recent sessions list */}
        {sessions.length > 0 && (
          <section className={styles.block}>
            <div className={styles.blockHeader}>
              <h2 className={styles.blockTitle}>Recent sessions</h2>
            </div>
            <div className={styles.sectionBody}>
              {sessions.map((session, index) => (
                <SessionRow
                  key={
                    session.id ||
                    `${session.owner_handle || session.handle}:${session.started_at || index}`
                  }
                  session={session}
                />
              ))}
            </div>
          </section>
        )}

        {/* Daily trends */}
        {hasTrends && (
          <section className={styles.block} style={{ marginTop: 32 }}>
            <div className={styles.blockHeader}>
              <h2 className={styles.blockTitle}>Daily trends</h2>
              <span className={styles.blockMeta}>{analytics.period_days}d</span>
            </div>
            <div
              className={styles.tableWrap}
              style={{ '--table-grid': '1fr repeat(4, auto)' } as CSSProperties}
            >
              <div className={styles.tableHead}>
                <span className={styles.thLeft}>Day</span>
                <span className={styles.th}>Sessions</span>
                <span className={styles.th}>Edits</span>
                <span className={styles.th}>Lines</span>
                <span className={styles.th}>Avg min</span>
              </div>
              <div className={styles.tableBody}>
                {analytics.daily_trends.map((trend, i) => (
                  <div
                    key={trend.day}
                    className={styles.tableRow}
                    style={{ '--row-index': i } as CSSProperties}
                  >
                    <span className={styles.tdLeft}>{trend.day.slice(5)}</span>
                    <span className={styles.td}>{trend.sessions}</span>
                    <span className={styles.td}>{trend.edits}</span>
                    <span className={styles.td}>
                      {trend.lines_added > 0 || trend.lines_removed > 0
                        ? `+${trend.lines_added}/\u2212${trend.lines_removed}`
                        : '\u2014'}
                    </span>
                    <span className={styles.td}>
                      {trend.avg_duration_min > 0 ? trend.avg_duration_min.toFixed(0) : '\u2014'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Edit log */}
        {hasEdits && (
          <section className={styles.block} style={{ marginTop: 32 }}>
            <div className={styles.blockHeader}>
              <h2 className={styles.blockTitle}>Edit log</h2>
              <span className={styles.blockMeta}>{edits.length} edits / 7d</span>
            </div>
            <div
              className={styles.tableWrap}
              style={{ '--table-grid': '1fr auto auto auto' } as CSSProperties}
            >
              <div className={styles.tableHead}>
                <span className={styles.thLeft}>File</span>
                <span className={styles.th}>By</span>
                <span className={styles.th}>Lines</span>
                <span className={styles.th}>When</span>
              </div>
              <div className={styles.tableBody}>
                {edits.map((edit, i) => (
                  <div
                    key={edit.id}
                    className={styles.tableRow}
                    style={{ '--row-index': i } as CSSProperties}
                  >
                    <span className={styles.tdLeft} title={edit.file_path}>
                      {edit.file_path.split('/').slice(-2).join('/')}
                    </span>
                    <span className={styles.td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ToolIcon tool={edit.host_tool} size={12} />
                        {edit.handle}
                      </span>
                    </span>
                    <span className={styles.td}>
                      {edit.lines_added > 0 || edit.lines_removed > 0
                        ? `+${edit.lines_added}/\u2212${edit.lines_removed}`
                        : '\u2014'}
                    </span>
                    <span className={styles.td}>
                      {formatRelativeTime(edit.created_at) || '\u2014'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <div className={styles.asideStack}>
        {/* 24h totals */}
        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>24h totals</h2>
          </div>
          <div className={styles.summaryGrid}>
            <SummaryStat label="edits reported" value={sessionEditCount} />
            <SummaryStat label="files touched" value={filesTouchedCount} />
            <SummaryStat label="sessions still live" value={liveSessionCount} />
            {hasLines && (
              <SummaryStat
                label="lines changed"
                value={`+${lineStats.added} / \u2212${lineStats.removed}`}
              />
            )}
          </div>
        </section>

        {/* Outcomes */}
        {outcomeBreakdown.total > 0 && (
          <section className={styles.block}>
            <div className={styles.blockHeader}>
              <h2 className={styles.blockTitle}>Outcomes</h2>
              <span className={styles.blockMeta}>{outcomeBreakdown.total} sessions</span>
            </div>
            <div className={styles.summaryGrid}>
              {outcomeBreakdown.completed > 0 && (
                <SummaryStat label="completed" value={outcomeBreakdown.completed} />
              )}
              {outcomeBreakdown.abandoned > 0 && (
                <SummaryStat label="abandoned" value={outcomeBreakdown.abandoned} />
              )}
              {outcomeBreakdown.failed > 0 && (
                <SummaryStat label="failed" value={outcomeBreakdown.failed} />
              )}
              {outcomeBreakdown.unknown > 0 && (
                <SummaryStat label="unknown" value={outcomeBreakdown.unknown} />
              )}
            </div>
          </section>
        )}

        {/* Tool distribution */}
        {hasToolDist && (
          <section className={styles.block}>
            <div className={styles.blockHeader}>
              <h2 className={styles.blockTitle}>By tool</h2>
            </div>
            <div className={styles.distributionList}>
              {analytics.tool_distribution.map((tool) => (
                <div key={tool.host_tool} className={styles.distributionRow}>
                  <div className={styles.distributionCopy}>
                    <span className={styles.distributionLabel}>
                      <ToolIcon tool={tool.host_tool} size={16} />
                      <span>{tool.host_tool}</span>
                    </span>
                    <span className={styles.distributionMeta}>
                      {tool.sessions} sessions / {tool.edits} edits
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* File heatmap */}
        {hasHeatmap && (
          <section className={styles.block}>
            <div className={styles.blockHeader}>
              <h2 className={styles.blockTitle}>Most edited files</h2>
              <span className={styles.blockMeta}>{analytics.period_days}d</span>
            </div>
            <div className={styles.pathList}>
              {analytics.file_heatmap.slice(0, 15).map((entry) => (
                <span key={entry.file} className={styles.pathRow}>
                  <span className={styles.pathFile}>{entry.file}</span>
                  <span className={styles.pathCount}>{entry.touch_count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Files touched (24h) */}
        {hasFiles && !hasHeatmap && (
          <section className={styles.block}>
            <div className={styles.blockHeader}>
              <h2 className={styles.blockTitle}>Files touched</h2>
              <span className={styles.blockMeta}>{filesTouched.length}</span>
            </div>
            <div className={styles.pathList}>
              {filesTouched.map((file) => (
                <span key={`history:${file}`} className={styles.pathRow}>
                  {file}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
