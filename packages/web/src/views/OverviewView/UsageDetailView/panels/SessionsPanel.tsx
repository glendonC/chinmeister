import { useMemo, type CSSProperties } from 'react';
import clsx from 'clsx';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  DotMatrix,
  DurationStrip,
  HeroStatRow,
  HourHeatmap,
  LegendDot,
  LegendHatch,
  type HeroStatDef,
  type HourCell,
} from '../../../../components/viz/index.js';
import ToolIcon from '../../../../components/ToolIcon/ToolIcon.js';
import { arcPath, computeArcSlices } from '../../../../lib/svgArcs.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { navigate, setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { DAY_LABELS } from '../../../../widgets/utils.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, formatStripDate, hourGlyph } from '../format.js';
import styles from '../UsageDetailView.module.css';

export function SessionsPanel({ analytics }: { analytics: UserAnalytics }) {
  const cs = analytics.completion_summary;
  const totalSessions = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
  const stuck = analytics.stuckness;
  const firstEdit = analytics.first_edit_stats;

  const byTool = useMemo(() => {
    return [...analytics.tool_comparison]
      .filter((t) => t.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions);
  }, [analytics]);

  // Active question id from `?q=`, read at the top so subsequent early
  // returns don't violate hooks rules. FocusedDetailView tolerates null
  // and falls back to the first question.
  const activeId = useQueryParam('q');

  const durationDist = analytics.duration_distribution.filter((b) => b.count > 0);

  // Daily outcome strip, per-day stacked column (completed/abandoned/failed,
  // unknown on top). Replaces separate outcome-split bar + daily-trend
  // sparkline: one viz answers "what's the mix" and "how is it trending".
  const dailyMaxTotal = Math.max(1, ...analytics.daily_trends.map((row) => row.sessions));

  if (totalSessions === 0) {
    return <span className={styles.empty}>No sessions captured in this window.</span>;
  }

  // Session-health hero: two ratio-based quality stats (completed,
  // stalled), each paired with a DotMatrix so the number has literal
  // visual reference. First-edit is timing/onboarding (lives next to
  // duration); period delta lives on the SESSIONS tab itself, both
  // intentionally excluded here so the row stays cohesive and visually
  // balanced against the BY TOOL column across the gap.
  const heroStats: HeroStatDef[] = [];
  if (cs.total_sessions > 0 && cs.completion_rate > 0) {
    heroStats.push({
      key: 'completed',
      value: String(Math.round(cs.completion_rate)),
      unit: '%',
      label: 'completed',
      sublabel: `${fmtCount(cs.completed)} of ${fmtCount(cs.total_sessions)} sessions`,
      color: 'var(--success)',
      viz: <DotMatrix total={cs.total_sessions} filled={cs.completed} color="var(--success)" />,
    });
  }
  if (stuck.total_sessions > 0 && stuck.stuck_sessions > 0) {
    const rate = Math.round(stuck.stuckness_rate);
    const color = rate >= 40 ? 'var(--danger)' : rate >= 15 ? 'var(--warn)' : 'var(--ink)';
    heroStats.push({
      key: 'stalled',
      value: String(rate),
      unit: '%',
      label: 'stalled 15+ min',
      sublabel: `${fmtCount(stuck.stuck_sessions)} of ${fmtCount(stuck.total_sessions)} sessions`,
      color,
      viz: <DotMatrix total={stuck.total_sessions} filled={stuck.stuck_sessions} color={color} />,
    });
  }

  const hasHero = heroStats.length > 0;
  const firstEditMin = firstEdit.median_minutes_to_first_edit;
  const firstEditDisplay =
    firstEditMin > 0
      ? firstEditMin >= 10
        ? String(Math.round(firstEditMin))
        : firstEditMin.toFixed(1)
      : null;

  // Editorial answers: one concrete sentence per section, computed from
  // the same data the viz below renders. Numbers get <strong> so the
  // answer can be scanned at a glance without losing prose voice.
  // Answers lead with the finding, not the metric name ("73% completed",
  // not "Completion rate: 73%"). Empty-data branches degrade to the
  // honest subset rather than fabricating a narrative.

  // Metric tones tie prose numbers to viz colors. Completion = positive
  // (green dots), stall = warning (amber), neutral counts/times = ink.
  // See Metric.tsx for the tone guide. Don't tone a number just because
  // it's a number, tone only what has inherent good/bad direction.
  const healthAnswer = (() => {
    const rate = Math.round(cs.completion_rate);
    const stalledRate = stuck.total_sessions > 0 ? Math.round(stuck.stuckness_rate) : null;
    if (rate > 0 && stalledRate != null && stalledRate > 0) {
      return (
        <>
          <Metric tone="positive">{rate}%</Metric> completed.{' '}
          <Metric tone="warning">{stalledRate}%</Metric> stalled past 15 minutes.
        </>
      );
    }
    if (rate > 0) {
      return (
        <>
          <Metric tone="positive">{rate}%</Metric> of {fmtCount(cs.total_sessions)} sessions
          completed.
        </>
      );
    }
    return null;
  })();

  const byToolAnswer = (() => {
    if (byTool.length === 0) return null;
    if (byTool.length === 1) {
      const only = byTool[0];
      return (
        <>
          All sessions ran through <Metric>{getToolMeta(only.host_tool).label}</Metric> at{' '}
          <Metric tone="positive">{Math.round(only.completion_rate)}%</Metric> completion.
        </>
      );
    }
    // Leader = highest completion rate among tools with meaningful volume
    // (at least 5 sessions OR 10% of total, whichever is higher). Prevents
    // a 1-session 100%-completion tool from pretending to lead.
    const threshold = Math.max(5, Math.floor(totalSessions * 0.1));
    const qualified = byTool.filter((t) => t.sessions >= threshold);
    const leader = qualified.sort((a, b) => b.completion_rate - a.completion_rate)[0];
    if (!leader) {
      return <>Completion is close across the {byTool.length} tools in this window.</>;
    }
    return (
      <>
        <Metric>{getToolMeta(leader.host_tool).label}</Metric> leads at{' '}
        <Metric tone="positive">{Math.round(leader.completion_rate)}%</Metric> completion across{' '}
        <Metric>{fmtCount(leader.sessions)}</Metric> sessions.
      </>
    );
  })();

  const dailyAnswer = (() => {
    if (analytics.daily_trends.length < 2) return null;
    const peak = analytics.daily_trends.reduce((best, row) =>
      row.sessions > best.sessions ? row : best,
    );
    if (peak.sessions === 0) return null;
    return (
      <>
        Busiest day <Metric>{peak.day}</Metric> at{' '}
        <Metric>{fmtCount(peak.sessions)} sessions</Metric>.
      </>
    );
  })();

  // Hour x day-of-week cells from hourly_distribution. Same shape the
  // RhythmPanel feeds HourHeatmap, scoped here to sessions only so the
  // Usage Sessions hero "when did sessions peak in the day?" question
  // can render without crossing into Activity territory.
  const hourCells: HourCell[] = (() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const h of analytics.hourly_distribution) {
      grid[h.dow][h.hour] = (grid[h.dow][h.hour] || 0) + h.sessions;
    }
    const out: HourCell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const v = grid[dow][hour];
        if (v > 0) out.push({ dow, hour, value: v });
      }
    }
    return out;
  })();

  const peakHourCell = hourCells.reduce<{ dow: number; hour: number; value: number } | null>(
    (best, c) => (best === null || c.value > best.value ? c : best),
    null,
  );

  const peakHourAnswer = peakHourCell ? (
    <>
      Peaks <Metric>{DAY_LABELS[peakHourCell.dow]}</Metric> at{' '}
      <Metric>{hourGlyph(peakHourCell.hour)}</Metric> with{' '}
      <Metric>{fmtCount(peakHourCell.value)} sessions</Metric>.
    </>
  ) : null;

  const durationAnswer = (() => {
    if (durationDist.length === 0) return null;
    const total = durationDist.reduce((s, b) => s + b.count, 0);
    const shortBuckets = durationDist
      .filter((b) => b.bucket === '0-5m' || b.bucket === '5-15m')
      .reduce((s, b) => s + b.count, 0);
    const shortPct = total > 0 ? Math.round((shortBuckets / total) * 100) : 0;
    if (firstEditDisplay && shortPct > 0) {
      return (
        <>
          First edit lands at <Metric>{firstEditDisplay} min</Metric> median.{' '}
          <Metric>{shortPct}%</Metric> of sessions finish under 15 minutes.
        </>
      );
    }
    if (firstEditDisplay) {
      return (
        <>
          First edit lands at <Metric>{firstEditDisplay} min</Metric> median.
        </>
      );
    }
    if (shortPct > 0) {
      return (
        <>
          <Metric>{shortPct}%</Metric> of sessions finish under 15 minutes.
        </>
      );
    }
    return null;
  })();

  // Each question is a self-contained entry: id for URL, Q + A for the
  // sidebar, viz as children. Declared top-down in the order the user
  // would naturally read them, finding → where → when → how long.
  // Entries without data drop out via the `if` guards so a new user
  // with no tool-level data never sees a question that can't answer.
  const questions: FocusedQuestion[] = [];
  if (hasHero && healthAnswer) {
    questions.push({
      id: 'finishing',
      question: 'Are sessions finishing?',
      answer: healthAnswer,
      children: <HeroStatRow stats={heroStats} direction="column" />,
    });
  }
  if (byTool.length > 0 && byToolAnswer) {
    questions.push({
      id: 'by-tool',
      question: 'Which tool finishes the job?',
      answer: byToolAnswer,
      children: <ToolRing entries={byTool} total={totalSessions} />,
      relatedLinks: getCrossLinks('usage', 'sessions', 'by-tool'),
    });
  }
  if (analytics.daily_trends.length >= 2 && dailyAnswer) {
    questions.push({
      id: 'peak',
      question: 'When did the week peak?',
      answer: dailyAnswer,
      children: (
        <>
          <DailyOutcomeStrip trends={analytics.daily_trends} maxTotal={dailyMaxTotal} />
          <div className={styles.stripLegend}>
            <LegendDot color="var(--success)" label="completed" />
            <LegendDot color="var(--warn)" label="abandoned" />
            <LegendDot color="var(--danger)" label="failed" />
            <LegendHatch label="no outcome" />
          </div>
        </>
      ),
    });
  }
  if (peakHourCell && peakHourAnswer) {
    questions.push({
      id: 'peak-hour',
      question: 'When in the day did sessions peak?',
      answer: peakHourAnswer,
      children: <HourHeatmap data={hourCells} cellSize={16} />,
    });
  }
  if (durationDist.length > 0 && durationAnswer) {
    questions.push({
      id: 'duration',
      question: 'How long do sessions run?',
      answer: durationAnswer,
      children: <DurationStrip buckets={durationDist} />,
    });
  }

  if (questions.length === 0) {
    return <span className={styles.empty}>No sessions captured in this window.</span>;
  }

  return (
    <FocusedDetailView
      questions={questions}
      activeId={activeId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}

// Mini share ring, same visual DNA as the Tools tab ring. Slices are
// tool-brand-colored, total sessions centered, legend below carries count
// and completion %. Clicking any slice or legend row navigates to the
// Tools tab so users can drill into that tool's config/health.
const RING_CX = 80;
const RING_CY = 80;
const RING_R = 56;
const RING_SW = 10;
// Gap must exceed 2×(SW/2)/R in degrees so round linecaps don't overlap
// into neighboring slices. At SW=10, R=56 that floor is ~10.24°.
const RING_GAP_DEG = 12;
// Top-N branded slices; the rest aggregate into a muted Other slice. Keeps
// every rendered arc above the cap-overlap floor regardless of tool count.
const RING_TOP_N = 5;
const OTHER_KEY = '__other';

function ToolRing({
  entries,
  total,
}: {
  entries: UserAnalytics['tool_comparison'];
  total: number;
}) {
  const arcs = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.sessions - a.sessions);
    const top = sorted.slice(0, RING_TOP_N);
    const tail = sorted.slice(RING_TOP_N);
    const tailSessions = tail.reduce((s, e) => s + e.sessions, 0);
    const slices = [
      ...top.map((e) => ({
        tool: e.host_tool,
        color: getToolMeta(e.host_tool).color,
        sessions: e.sessions,
      })),
      ...(tailSessions > 0
        ? [{ tool: OTHER_KEY, color: 'var(--soft)', sessions: tailSessions }]
        : []),
    ].filter((s) => s.sessions > 0);
    return computeArcSlices(
      slices.map((s) => s.sessions),
      RING_GAP_DEG,
    )
      .map((seg, i) => ({ ...slices[i], ...seg }))
      .filter((arc) => arc.sweepDeg > 0.2);
  }, [entries]);

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
              key={arc.tool}
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
                Share
              </th>
              <th scope="col" className={clsx(styles.toolTh, styles.toolThNum)}>
                Done
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((t, i) => {
              const meta = getToolMeta(t.host_tool);
              const share = total > 0 ? Math.round((t.sessions / total) * 100) : 0;
              return (
                <tr
                  key={t.host_tool}
                  className={styles.toolRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <td className={styles.toolCellName}>
                    <ToolIcon tool={t.host_tool} size={14} />
                    <span>{meta.label}</span>
                  </td>
                  <td className={styles.toolCellNum}>{fmtCount(t.sessions)}</td>
                  <td className={styles.toolCellNum}>{share}%</td>
                  <td className={styles.toolCellNum}>
                    {t.completion_rate > 0 ? `${Math.round(t.completion_rate)}%` : '—'}
                  </td>
                </tr>
              );
            })}
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

// Per-day stacked column strip. Column height = total sessions / max total.
// Segments stack bottom-up: completed, abandoned, failed, then unknown.
// Animation delay staggers left-to-right via --col-index to match the
// rowReveal pattern elsewhere.
function DailyOutcomeStrip({
  trends,
  maxTotal,
}: {
  trends: UserAnalytics['daily_trends'];
  maxTotal: number;
}) {
  const labelSpacing = Math.max(1, Math.floor(trends.length / 6));
  return (
    <div className={styles.strip}>
      <div className={styles.stripGrid}>
        {trends.map((row, i) => {
          const total = row.sessions;
          const unknown = Math.max(0, total - row.completed - row.abandoned - row.failed);
          const columnHeightPct = (total / maxTotal) * 100;
          return (
            <div
              key={row.day}
              className={styles.stripCol}
              style={{ '--col-index': i } as CSSProperties}
              title={`${row.day} · ${total} sessions`}
            >
              <div className={styles.stripColInner}>
                <div className={styles.stripColStack} style={{ height: `${columnHeightPct}%` }}>
                  {row.completed > 0 && (
                    <div
                      className={styles.stripSeg}
                      style={{
                        flex: row.completed,
                        background: 'var(--success)',
                      }}
                    />
                  )}
                  {row.abandoned > 0 && (
                    <div
                      className={styles.stripSeg}
                      style={{
                        flex: row.abandoned,
                        background: 'var(--warn)',
                      }}
                    />
                  )}
                  {row.failed > 0 && (
                    <div
                      className={styles.stripSeg}
                      style={{
                        flex: row.failed,
                        background: 'var(--danger)',
                      }}
                    />
                  )}
                  {unknown > 0 && (
                    <div
                      className={clsx(styles.stripSeg, styles.stripSegHatch)}
                      style={{ flex: unknown }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.stripAxis}>
        {trends.map((row, i) => (
          <span
            key={row.day}
            className={styles.stripAxisLabel}
            data-visible={
              i === 0 || i === trends.length - 1 || i % labelSpacing === 0 ? 'true' : 'false'
            }
          >
            {formatStripDate(row.day)}
          </span>
        ))}
      </div>
    </div>
  );
}
