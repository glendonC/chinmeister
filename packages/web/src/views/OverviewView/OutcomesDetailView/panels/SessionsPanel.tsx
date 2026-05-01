import { type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { RateBars, RateVolumeColumns } from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { arcPath, computeArcSlices } from '../../../../lib/svgArcs.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';
import { capabilityCoverageNote, CoverageNote } from '../../../../widgets/bodies/shared.js';
import { workTypeColor } from '../../../../widgets/utils.js';
import shared from '../../../../widgets/widget-shared.module.css';

import { fmtCount, formatMinutes } from '../format.js';
import styles from '../OutcomesDetailView.module.css';

const STUCK_LIST_CAP = 10;

export function SessionsPanel({ analytics }: { analytics: UserAnalytics }) {
  const cs = analytics.completion_summary;
  const stuck = analytics.stuckness;
  const unanswered = analytics.unanswered_questions;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const conversationNote = capabilityCoverageNote(tools, 'conversationLogs');
  const outcomesSessionsActiveId = useQueryParam('q');

  if (cs.total_sessions === 0) {
    return <span className={styles.empty}>No sessions yet. Run one and drill back in.</span>;
  }

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
  // Work-type completion lives inside the sessions tab so the
  // "did the work land" thesis stays a sibling of "which kinds land".
  // The mirror in Activity (mix:completion) is the same shape against
  // the activity-mix lens; this one keeps the outcomes vocabulary.
  const wto = analytics.work_type_outcomes;
  if (wto.length > 0) {
    const best = [...wto].sort((a, b) => b.completion_rate - a.completion_rate)[0];
    const worst = [...wto].sort((a, b) => a.completion_rate - b.completion_rate)[0];
    const worstTone: 'warning' | 'negative' = worst.completion_rate < 40 ? 'negative' : 'warning';
    const sameRow = best.work_type === worst.work_type;
    questions.push({
      id: 'work-type',
      question: 'Which kinds of work finish?',
      answer: sameRow ? (
        <>
          Only <Metric>{best.work_type}</Metric> has enough sessions to score; it completes at{' '}
          <Metric tone="positive">{best.completion_rate}%</Metric>.
        </>
      ) : (
        <>
          <Metric>{best.work_type}</Metric> completes at{' '}
          <Metric tone="positive">{best.completion_rate}%</Metric>;{' '}
          <Metric>{worst.work_type}</Metric> trails at{' '}
          <Metric tone={worstTone}>{worst.completion_rate}%</Metric>.
        </>
      ),
      children: (
        <RateBars
          labelWidth={120}
          rows={wto.map((w) => ({
            key: w.work_type,
            label: w.work_type,
            rate: w.completion_rate,
            value: `${w.completion_rate}%`,
            sublabel: `${fmtCount(w.sessions)} sessions`,
            fillColor: workTypeColor(w.work_type),
          }))}
        />
      ),
      relatedLinks: getCrossLinks('outcomes', 'sessions', 'work-type'),
    });
  }
  questions.push({
    id: 'unanswered-questions',
    question: 'Which questions were left behind?',
    answer:
      unanswered.count > 0 ? (
        <>
          <Metric tone="warning">{fmtCount(unanswered.count)}</Metric> user questions were inside
          sessions that ended abandoned.
        </>
      ) : (
        <>No abandoned sessions contained user questions in this window.</>
      ),
    children: (
      <>
        {unanswered.recent.length > 0 ? (
          <div className={shared.dataList}>
            {unanswered.recent.map((entry, i) => {
              const meta = entry.host_tool ? getToolMeta(entry.host_tool) : null;
              return (
                <div
                  key={entry.event_id}
                  className={shared.dataRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <span className={styles.questionPreview}>{entry.question_preview}</span>
                  <div className={shared.dataMeta}>
                    {meta && (
                      <span className={shared.dataStat}>
                        <span
                          className={styles.questionToolDot}
                          style={{ background: meta.color }}
                          aria-hidden="true"
                        />
                        {meta.label}
                      </span>
                    )}
                    <span className={shared.dataStat}>{entry.created_at.slice(5, 10)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : unanswered.count > 0 ? (
          <div className={styles.stuckRow}>
            <span className={styles.stuckHero}>
              <span className={styles.stuckValue}>{fmtCount(unanswered.count)}</span>
            </span>
            <div className={styles.stuckFacts}>
              <span className={styles.stuckFact}>
                <span className={styles.stuckFactValue}>abandoned-question turns</span>
              </span>
              <span className={styles.stuckFact}>
                Review these as follow-up intent, memory candidates, or a retry queue.
              </span>
            </div>
          </div>
        ) : (
          <span className={styles.empty}>
            Questions appear here when a session ends abandoned after the user asked for help.
          </span>
        )}
        <CoverageNote text={conversationNote} />
      </>
    ),
  });
  questions.push({
    id: 'stall',
    question: 'How often did agents stall?',
    answer: stuckAnswer,
    children: (
      <>
        <StuckBlock stuck={stuck} />
        {stuck.stuck_sessions_list.length > 0 && (
          <StuckSessionList list={stuck.stuck_sessions_list} />
        )}
      </>
    ),
  });

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

function StuckSessionList({ list }: { list: UserAnalytics['stuckness']['stuck_sessions_list'] }) {
  const visible = list.slice(0, STUCK_LIST_CAP);
  const overflow = Math.max(0, list.length - visible.length);
  return (
    <div className={styles.stuckListWrap}>
      <div className={shared.dataList}>
        {visible.map((entry, i) => {
          const meta = entry.host_tool ? getToolMeta(entry.host_tool) : null;
          const shortId = entry.session_id.slice(0, 8);
          const fileLabel = entry.file_path ? lastPathSegment(entry.file_path) : null;
          return (
            <div
              key={entry.session_id}
              className={shared.dataRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.stuckListAgent}>
                {meta && (
                  <span
                    className={styles.stuckListAgentDot}
                    style={{ background: meta.color }}
                    aria-hidden="true"
                  />
                )}
                <span className={styles.stuckListAgentLabel}>
                  {meta ? meta.label : entry.agent_id}
                </span>
              </span>
              <span className={styles.stuckListId} title={entry.session_id}>
                {shortId}
              </span>
              {fileLabel && (
                <span className={styles.stuckListFile} title={entry.file_path ?? undefined}>
                  {fileLabel}
                </span>
              )}
              <span className={styles.stuckListDuration}>
                {formatMinutes(entry.duration_minutes)}m
              </span>
              <Metric tone={entry.recovered ? 'positive' : 'warning'}>
                {entry.recovered ? 'recovered' : 'active'}
              </Metric>
            </div>
          );
        })}
      </div>
      {overflow > 0 && <div className={shared.moreHidden}>+{overflow} more</div>}
    </div>
  );
}

function lastPathSegment(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function CompletionTrendDetail({ trends }: { trends: UserAnalytics['daily_trends'] }) {
  const observed = trends.filter((d) => (d.sessions ?? 0) > 0);
  const maxSessions = Math.max(...observed.map((d) => d.sessions ?? 0), 1);
  return (
    <RateVolumeColumns
      minFrameHeightPx={180}
      staggerMs={25}
      legend={{ left: 'daily completion rate', right: 'opacity shows session volume' }}
      columns={trends.map((d) => {
        const sessions = d.sessions ?? 0;
        const rate = sessions > 0 ? Math.round(((d.completed ?? 0) / sessions) * 100) : null;
        return {
          key: d.day,
          label: d.day.slice(5),
          rateLabel: rate == null ? '-' : `${rate}%`,
          volume: sessions,
          rate,
          opacity: sessions > 0 ? Math.max(0.45, sessions / maxSessions) : 0.16,
          title:
            rate == null
              ? `${d.day}: no sessions`
              : `${d.day}: ${rate}% completed, ${d.completed ?? 0} of ${sessions} sessions`,
        };
      })}
    />
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
