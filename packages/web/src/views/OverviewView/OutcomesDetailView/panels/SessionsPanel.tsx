import { type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { arcPath, computeArcSlices } from '../../../../lib/svgArcs.js';
import { completionColor } from '../../../../widgets/utils.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, formatMinutes } from '../format.js';
import styles from '../OutcomesDetailView.module.css';

export function SessionsPanel({ analytics }: { analytics: UserAnalytics }) {
  const cs = analytics.completion_summary;
  const stuck = analytics.stuckness;
  const fe = analytics.first_edit_stats;
  const dd = analytics.duration_distribution;
  const outcomesSessionsActiveId = useQueryParam('q');

  if (cs.total_sessions === 0) {
    return <span className={styles.empty}>No sessions yet. Run one and drill back in.</span>;
  }

  const byTool = fe.by_tool.filter((t) => t.avg_minutes > 0).slice(0, 6);
  const durTotal = dd.reduce((s, b) => s + b.count, 0);

  // Tones: completion rate -> positive, stuck rate -> warning, time/count
  // neutral. Same vocabulary as UsageDetailView so the system reads as
  // one object across both detail views.
  const completionAnswer = (
    <>
      <Metric>{fmtCount(cs.completed)}</Metric> of <Metric>{fmtCount(cs.total_sessions)}</Metric>{' '}
      sessions completed (<Metric tone="positive">{Math.round(cs.completion_rate)}%</Metric>).
    </>
  );
  const observedDays = analytics.daily_trends.filter((d) => (d.sessions ?? 0) > 0);
  const dailyTrendAnswer =
    observedDays.length >= 2 ? completionDailyTrendSentence(observedDays) : null;

  const stuckAnswer =
    stuck.stuck_sessions === 0 ? (
      <>No sessions hit the 15-minute stall threshold in this window.</>
    ) : (
      <>
        <Metric>{fmtCount(stuck.stuck_sessions)}</Metric> of{' '}
        <Metric>{fmtCount(stuck.total_sessions)}</Metric> sessions (
        <Metric tone="warning">{stuck.stuckness_rate}%</Metric>) stalled 15+ minutes.
        {stuck.stuck_sessions >= 5 && (
          <>
            {' '}
            <Metric>{stuck.stuck_completion_rate}%</Metric> of stuck sessions later completed.
          </>
        )}
      </>
    );

  const firstEditAnswer = (() => {
    if (fe.median_minutes_to_first_edit <= 0 && fe.avg_minutes_to_first_edit <= 0) return null;
    const median = formatMinutes(fe.median_minutes_to_first_edit);
    if (byTool.length > 1) {
      const minTool = formatMinutes(Math.min(...byTool.map((t) => t.avg_minutes)));
      const maxTool = formatMinutes(Math.max(...byTool.map((t) => t.avg_minutes)));
      return (
        <>
          Median time to first edit is <Metric>{median} min</Metric>, ranging{' '}
          <Metric>{minTool}</Metric>-<Metric>{maxTool} min</Metric> across{' '}
          <Metric>{byTool.length} tools</Metric>.
        </>
      );
    }
    return (
      <>
        Median time to first edit is <Metric>{median} min</Metric>.
      </>
    );
  })();

  const durationAnswer = (
    <>
      Distributed across <Metric>{fmtCount(durTotal)}</Metric> sessions with an outcome recorded.
    </>
  );

  const questions: FocusedQuestion[] = [
    {
      id: 'completion',
      question: "Did this period's sessions land?",
      answer: completionAnswer,
      children: <DetailRing cs={cs} />,
      relatedLinks: getCrossLinks('outcomes', 'sessions', 'completion'),
    },
  ];
  if (dailyTrendAnswer) {
    questions.push({
      id: 'trend',
      question: 'Is completion improving?',
      answer: dailyTrendAnswer,
      children: <CompletionTrendDetail trends={analytics.daily_trends} />,
    });
  }
  questions.push({
    id: 'stall',
    question: 'How often did agents stall?',
    answer: stuckAnswer,
    children: <StuckBlock stuck={stuck} />,
  });
  if (
    (fe.median_minutes_to_first_edit > 0 || fe.avg_minutes_to_first_edit > 0) &&
    firstEditAnswer
  ) {
    questions.push({
      id: 'first-edit',
      question: 'How fast did agents start editing?',
      answer: firstEditAnswer,
      children: <FirstEditBlock fe={fe} byTool={byTool} />,
    });
  }
  if (durTotal > 0) {
    questions.push({
      id: 'duration',
      question: 'How long did sessions run?',
      answer: durationAnswer,
      children: <DurationStrip buckets={dd} total={durTotal} />,
    });
  }

  return (
    <FocusedDetailView
      questions={questions}
      activeId={outcomesSessionsActiveId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}

const RING_CX = 110;
const RING_CY = 110;
const RING_R = 82;
const RING_SW = 12;
const RING_GAP_DEG = 14;

interface SliceDef {
  key: string;
  label: string;
  count: number;
  color: string;
  muted: boolean;
}

function DetailRing({ cs }: { cs: UserAnalytics['completion_summary'] }) {
  const allSlices: SliceDef[] = [
    {
      key: 'completed',
      label: 'completed',
      count: cs.completed,
      color: 'var(--success)',
      muted: false,
    },
    {
      key: 'abandoned',
      label: 'abandoned',
      count: cs.abandoned,
      color: 'var(--warn)',
      muted: false,
    },
    { key: 'failed', label: 'failed', count: cs.failed, color: 'var(--danger)', muted: false },
    { key: 'unknown', label: 'no outcome', count: cs.unknown, color: 'var(--ghost)', muted: true },
  ];
  const visibleSlices = allSlices.filter((s) => s.count > 0);
  const ringSlices = visibleSlices.filter((s) => !s.muted);

  const arcs = computeArcSlices(
    ringSlices.map((s) => s.count),
    RING_GAP_DEG,
  ).map((seg, i) => ({ ...ringSlices[i], ...seg }));

  const rate = Math.round(cs.completion_rate);
  const unreported = cs.unknown;
  const showCaveat = unreported > 0 && unreported / cs.total_sessions > 0.3;

  return (
    <div className={styles.ringBlock}>
      <div className={styles.ringMedia}>
        <svg
          viewBox="0 0 220 220"
          className={styles.ringSvg}
          role="img"
          aria-label={`Completion rate ${rate}%`}
        >
          <circle
            cx={RING_CX}
            cy={RING_CY}
            r={RING_R}
            fill="none"
            stroke="var(--hover-bg)"
            strokeWidth={RING_SW}
          />
          {arcs
            .filter((a) => a.sweepDeg > 0.2)
            .map((a) => (
              <path
                key={a.key}
                d={arcPath(RING_CX, RING_CY, RING_R, a.startDeg, a.sweepDeg)}
                fill="none"
                stroke={a.color}
                strokeWidth={RING_SW}
                strokeLinecap="round"
                opacity={0.9}
              >
                <title>
                  {a.label}: {a.count}
                </title>
              </path>
            ))}
        </svg>
        <div className={styles.ringOverlay}>
          <span className={styles.ringValue}>
            {rate}
            <span className={styles.ringValueUnit}>%</span>
          </span>
          {showCaveat && (
            <span className={styles.ringCaveat}>
              {cs.total_sessions - cs.unknown} of {cs.total_sessions} reported
            </span>
          )}
        </div>
      </div>
      <div className={styles.ringLegend}>
        {visibleSlices.map((s, i) => {
          const share = cs.total_sessions > 0 ? Math.round((s.count / cs.total_sessions) * 100) : 0;
          return (
            <div
              key={s.key}
              className={styles.legendRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.legendDot} style={{ background: s.color }} />
              <span className={styles.legendLabel}>{s.label}</span>
              <span className={styles.legendCount}>{fmtCount(s.count)}</span>
              <span className={styles.legendShare}>{share}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StuckBlock({ stuck }: { stuck: UserAnalytics['stuckness'] }) {
  return (
    <div
      className={styles.stuckRow}
      title="A session is flagged stuck when its heartbeat stalls 15+ minutes while still open."
    >
      <span className={styles.stuckHero}>
        <span className={styles.stuckValue}>{stuck.stuckness_rate}</span>
        <span className={styles.stuckUnit}>%</span>
      </span>
      <div className={styles.stuckFacts}>
        <span className={styles.stuckFact}>
          <span className={styles.stuckFactValue}>{fmtCount(stuck.stuck_sessions)}</span> of{' '}
          {fmtCount(stuck.total_sessions)} sessions stalled
        </span>
        {stuck.stuck_sessions >= 5 && (
          <span className={styles.stuckFact}>
            <span className={styles.stuckFactValue}>{stuck.stuck_completion_rate}%</span> recovered
            to completed
          </span>
        )}
        <span className={styles.stuckFact}>15-minute heartbeat gap while still open</span>
      </div>
    </div>
  );
}

function FirstEditBlock({
  fe,
  byTool,
}: {
  fe: UserAnalytics['first_edit_stats'];
  byTool: Array<{ host_tool: string; avg_minutes: number; sessions: number }>;
}) {
  return (
    <div className={styles.firstEditBlock}>
      <span className={styles.feHero}>
        <span className={styles.feValue}>{formatMinutes(fe.median_minutes_to_first_edit)}</span>
        <span className={styles.feUnit}>min</span>
      </span>
      <div className={styles.feChips}>
        {fe.avg_minutes_to_first_edit > 0 &&
          fe.avg_minutes_to_first_edit !== fe.median_minutes_to_first_edit && (
            <span className={styles.feChip}>
              <span className={styles.feChipDot} style={{ background: 'var(--soft)' }} />
              <span className={styles.feChipLabel}>avg</span>
              <span className={styles.feChipValue}>
                {formatMinutes(fe.avg_minutes_to_first_edit)}m
              </span>
            </span>
          )}
        {byTool.map((t) => {
          const meta = getToolMeta(t.host_tool);
          return (
            <span key={t.host_tool} className={styles.feChip}>
              <span className={styles.feChipDot} style={{ background: meta.color }} />
              <span className={styles.feChipLabel}>{meta.label}</span>
              <span className={styles.feChipValue}>{formatMinutes(t.avg_minutes)}m</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function DurationStrip({
  buckets,
  total,
}: {
  buckets: UserAnalytics['duration_distribution'];
  total: number;
}) {
  return (
    <div className={styles.durationFrame}>
      <div className={styles.durationBar}>
        {buckets.map((b, i) => {
          if (b.count === 0) return null;
          const share = b.count / total;
          const pos = buckets.length > 1 ? i / (buckets.length - 1) : 0;
          const color = pos <= 0.33 ? 'var(--success)' : pos >= 0.66 ? 'var(--warn)' : 'var(--ink)';
          return (
            <div
              key={b.bucket}
              className={styles.durationSegment}
              style={{
                flex: `${share} 1 0`,
                background: color,
                opacity: 0.65,
              }}
              title={`${b.bucket}: ${b.count} (${Math.round(share * 100)}%)`}
            />
          );
        })}
      </div>
      <div className={styles.durationLegend}>
        {buckets.map((b) => {
          const share = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <div key={b.bucket} className={styles.durationCell}>
              <span className={styles.durationBucket}>{b.bucket}</span>
              <span>
                <span className={styles.durationCount}>{fmtCount(b.count)}</span>
                <span className={styles.durationShare}>· {share}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompletionTrendDetail({ trends }: { trends: UserAnalytics['daily_trends'] }) {
  const observed = trends.filter((d) => (d.sessions ?? 0) > 0);
  const maxSessions = Math.max(...observed.map((d) => d.sessions ?? 0), 1);
  return (
    <div className={styles.dailyTrendDetail}>
      <div className={styles.dailyTrendBars}>
        {trends.map((d, i) => {
          const sessions = d.sessions ?? 0;
          const rate = sessions > 0 ? Math.round(((d.completed ?? 0) / sessions) * 100) : null;
          const color = rate == null ? 'var(--ghost)' : completionColor(rate);
          const height = rate == null ? 10 : Math.max(10, rate);
          const opacity = sessions > 0 ? Math.max(0.45, sessions / maxSessions) : 0.16;
          return (
            <span key={d.day} className={styles.dailyTrendColumn}>
              <span
                className={styles.dailyTrendBar}
                style={
                  {
                    '--row-index': i,
                    '--trend-height': `${height}%`,
                    background: color,
                    opacity,
                  } as CSSProperties
                }
                title={
                  rate == null
                    ? `${d.day}: no sessions`
                    : `${d.day}: ${rate}% completed, ${d.completed ?? 0} of ${sessions} sessions`
                }
              />
              <span className={styles.dailyTrendRate}>{rate == null ? '—' : `${rate}%`}</span>
            </span>
          );
        })}
      </div>
      <div className={styles.dailyTrendLegend}>
        <span>daily completion rate</span>
        <span>opacity shows session volume</span>
      </div>
    </div>
  );
}

function completionDailyTrendSentence(trends: UserAnalytics['daily_trends']) {
  const rates = trends
    .filter((d) => (d.sessions ?? 0) > 0)
    .map((d) => Math.round(((d.completed ?? 0) / (d.sessions ?? 1)) * 100));
  const first = rates[0] ?? 0;
  const last = rates[rates.length - 1] ?? first;
  const delta = last - first;
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  if (Math.abs(delta) >= 10) {
    const tone = delta > 0 ? 'positive' : 'negative';
    return (
      <>
        Completion moved from <Metric>{first}%</Metric> to <Metric tone={tone}>{last}%</Metric>{' '}
        across active days.
      </>
    );
  }
  if (high - low >= 30) {
    return (
      <>
        Completion is volatile, ranging from <Metric tone="warning">{low}%</Metric> to{' '}
        <Metric>{high}%</Metric> across active days.
      </>
    );
  }
  return (
    <>
      Completion held steady around <Metric tone="positive">{last}%</Metric> on the latest active
      day.
    </>
  );
}
