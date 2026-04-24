import { useMemo, type CSSProperties } from 'react';
import clsx from 'clsx';
import ToolIcon from '../../../components/ToolIcon/ToolIcon.js';
import { arcPath } from '../../../lib/svgArcs.js';
import { getToolMeta } from '../../../lib/toolMeta.js';
import { navigate } from '../../../lib/router.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';
import { fmtCount } from './shared.js';
import {
  RING_CX,
  RING_CY,
  RING_R,
  RING_SW,
  RING_GAP_DEG,
  RING_TOP_N,
  OTHER_KEY,
} from './ring-constants.js';
import styles from './UsageDetailView.module.css';

// Row shape for the tool table. Real tool rows carry their `host_tool`
// identifier for the ToolIcon; the aggregated tail rolls into a single
// `Other` row (`host_tool: null`) matching the ring's aggregation so the
// table and the ring never disagree about how many categories exist.
interface SessionsToolRow {
  key: string;
  host_tool: string | null;
  label: string;
  sessions: number;
  completionRate: number | null;
}

/**
 * Aggregate tool-comparison rows to match the ring's top-N + Other
 * aggregation. Keeps the table and the ring visually consistent — the
 * ring already truncates to RING_TOP_N slices, so the table rendering
 * every raw entry is the root cause of the visual weight asymmetry in
 * the paired hero row. Other's completion rate is a session-weighted
 * average of the tail (not a simple mean), which is the only honest
 * aggregate across tools with different sample sizes.
 */
function aggregateSessionsRows(entries: UserAnalytics['tool_comparison']): SessionsToolRow[] {
  const sorted = [...entries].filter((e) => e.sessions > 0).sort((a, b) => b.sessions - a.sessions);
  const top = sorted.slice(0, RING_TOP_N);
  const tail = sorted.slice(RING_TOP_N);
  const rows: SessionsToolRow[] = top.map((t) => ({
    key: t.host_tool,
    host_tool: t.host_tool,
    label: getToolMeta(t.host_tool).label,
    sessions: t.sessions,
    completionRate: t.completion_rate > 0 ? t.completion_rate : null,
  }));
  const tailSessions = tail.reduce((s, e) => s + e.sessions, 0);
  if (tailSessions > 0) {
    // Session-weighted completion rate; ignore rows with no completion data.
    const rated = tail.filter((t) => t.completion_rate > 0);
    const weight = rated.reduce((s, e) => s + e.sessions, 0);
    const weighted = rated.reduce((s, e) => s + e.completion_rate * e.sessions, 0);
    rows.push({
      key: OTHER_KEY,
      host_tool: null,
      label: `Other · ${tail.length} tools`,
      sessions: tailSessions,
      completionRate: weight > 0 ? weighted / weight : null,
    });
  }
  return rows;
}

export default function ToolRing({
  entries,
  total,
}: {
  entries: UserAnalytics['tool_comparison'];
  total: number;
}) {
  const rows = useMemo(() => aggregateSessionsRows(entries), [entries]);

  const arcs = useMemo(() => {
    const out: Array<{
      key: string;
      color: string;
      startDeg: number;
      sweepDeg: number;
    }> = [];
    const safeTotal = Math.max(1, total);
    const gaps = rows.length * RING_GAP_DEG;
    const available = Math.max(0, 360 - gaps);
    let cursor = 0;
    for (const r of rows) {
      const color = r.host_tool ? getToolMeta(r.host_tool).color : 'var(--soft)';
      const sweep = (r.sessions / safeTotal) * available;
      if (sweep > 0.2) {
        out.push({ key: r.key, color, startDeg: cursor, sweepDeg: sweep });
      }
      cursor += sweep + RING_GAP_DEG;
    }
    return out;
  }, [rows, total]);

  return (
    <div className={styles.ringBlock}>
      <div className={styles.ringMedia}>
        <svg viewBox="0 0 160 160" className={styles.ringSvg} role="img" aria-label="Tool share">
          <circle
            cx={RING_CX}
            cy={RING_CY}
            r={RING_R}
            fill="none"
            stroke="var(--hover-bg)"
            strokeWidth={RING_SW}
          />
          {arcs.map((arc) => (
            <path
              key={arc.key}
              d={arcPath(RING_CX, RING_CY, RING_R, arc.startDeg, arc.sweepDeg)}
              fill="none"
              stroke={arc.color}
              strokeWidth={RING_SW}
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}
          <text
            x={RING_CX}
            y={RING_CY - 4}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--ink)"
            fontSize="26"
            fontWeight="200"
            fontFamily="var(--display)"
            letterSpacing="-0.04em"
          >
            {fmtCount(total)}
          </text>
          <text
            x={RING_CX}
            y={RING_CY + 16}
            textAnchor="middle"
            fill="var(--soft)"
            fontSize="8"
            fontFamily="var(--mono)"
            letterSpacing="0.14em"
          >
            SESSIONS
          </text>
        </svg>
      </div>
      <div className={styles.ringPanel}>
        <table className={styles.toolTable}>
          <thead>
            <tr>
              <th scope="col" className={styles.toolTh}>
                Tool
              </th>
              <th scope="col" className={clsx(styles.toolTh, styles.toolThNum)}>
                Sessions
              </th>
              <th scope="col" className={clsx(styles.toolTh, styles.toolThNum)}>
                Done
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.key}
                className={styles.toolRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <td className={styles.toolCellName}>
                  {row.host_tool ? (
                    <ToolIcon tool={row.host_tool} size={14} />
                  ) : (
                    <span className={styles.toolCellOtherDot} aria-hidden="true" />
                  )}
                  <span>{row.label}</span>
                </td>
                <td className={styles.toolCellNum}>{fmtCount(row.sessions)}</td>
                <td className={styles.toolCellNum}>
                  {row.completionRate != null ? `${Math.round(row.completionRate)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className={styles.toolsCta} onClick={() => navigate('tools')}>
          <span>Open Tools tab</span>
          <span className={styles.toolsCtaArrow} aria-hidden="true">
            ↗
          </span>
        </button>
      </div>
    </div>
  );
}
