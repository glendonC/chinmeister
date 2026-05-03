import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { RateVolumeColumns } from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { DAY_LABELS, EFFECTIVE_HOURS_MIN_QUALIFIED } from '../../../../widgets/utils.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, hourGlyph } from '../format.js';
import styles from '../ActivityDetailView.module.css';

const DOW_DIP_MIN_DELTA = 15;
const DOW_DIP_MIN_DOW_COUNT = 5;

export function EffectiveHoursPanel({
  analytics,
  qualifiedHours,
}: {
  analytics: UserAnalytics;
  qualifiedHours: UserAnalytics['hourly_effectiveness'];
}) {
  const activeId = useQueryParam('q');

  if (qualifiedHours.length < EFFECTIVE_HOURS_MIN_QUALIFIED) {
    return (
      <span className={styles.empty}>
        Per-hour completion rate needs sessions in at least {EFFECTIVE_HOURS_MIN_QUALIFIED} distinct
        hours. Off-hour bursts wash a 2-hour read.
      </span>
    );
  }

  // Q1 peak-completion
  const sortedByRate = [...qualifiedHours].sort((a, b) => b.completion_rate - a.completion_rate);
  const topHour = sortedByRate[0];
  const worstHour = sortedByRate[sortedByRate.length - 1];
  const worstTone = worstHour.completion_rate < 40 ? 'negative' : 'warning';

  const peakAnswer = (
    <>
      <Metric tone="positive">{hourGlyph(topHour.hour)}</Metric> completes{' '}
      <Metric tone="positive">{Math.round(topHour.completion_rate)}%</Metric> across{' '}
      <Metric>{fmtCount(topHour.sessions)}</Metric> sessions.
      {worstHour.hour !== topHour.hour && (
        <>
          {' '}
          <Metric tone="warning">{hourGlyph(worstHour.hour)}</Metric> trails at{' '}
          <Metric tone={worstTone}>{Math.round(worstHour.completion_rate)}%</Metric>.
        </>
      )}
    </>
  );

  // Bars ordered by clock, not by rate. Twin encoding: height = volume,
  // color = completionColor(rate). The rate label sits above each bar
  // so the user can read the quality without a legend.
  const byClock = [...qualifiedHours].sort((a, b) => a.hour - b.hour);

  const questions: FocusedQuestion[] = [
    {
      id: 'peak-completion',
      question: 'Which hours land your work?',
      answer: peakAnswer,
      children: <PeakCompletionViz hours={byClock} />,
      relatedLinks: getCrossLinks('activity', 'effective-hours', 'peak-completion'),
    },
  ];

  // Q3 dow-dip (Q2 dropped per synthesizer pre-pass)
  const dowDip = computeDowDip(analytics);
  if (dowDip) {
    questions.push({
      id: 'dow-dip',
      question: 'Is there a day-of-week dip?',
      answer: (
        <>
          <Metric>{DAY_LABELS[dowDip.worst.dow]}</Metric> dips to{' '}
          <Metric tone="warning">{dowDip.worst.rate}%</Metric>, against{' '}
          <Metric tone="positive">{dowDip.best.rate}%</Metric> on your best day.
        </>
      ),
      children: <DowDipViz rows={dowDip.rows} />,
    });
  }

  return (
    <FocusedDetailView
      questions={questions}
      activeId={activeId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}

function PeakCompletionViz({ hours }: { hours: UserAnalytics['hourly_effectiveness'] }) {
  return (
    <RateVolumeColumns
      minFrameHeightPx={180}
      legend={{ left: 'height shows session volume', right: 'color shows completion rate' }}
      columns={hours.map((h) => ({
        key: h.hour,
        label: hourGlyph(h.hour),
        rateLabel: `${Math.round(h.completion_rate)}%`,
        volume: h.sessions,
        rate: h.completion_rate,
        title: `${hourGlyph(h.hour)}: ${h.sessions} sessions, ${Math.round(h.completion_rate)}% completed`,
      }))}
    />
  );
}

interface DowDipRow {
  dow: number;
  sessions: number;
  rate: number;
}

function computeDowDip(
  analytics: UserAnalytics,
): { rows: DowDipRow[]; best: DowDipRow; worst: DowDipRow } | null {
  // Group daily_trends by day-of-week. Each row carries sessions +
  // completed counts; aggregate, then derive a per-DOW completion rate.
  // Render only when >= 5 DOWs have sessions and the best-vs-worst delta
  // is >= 15 points; below that the read is noise.
  const buckets: Array<{ sessions: number; completed: number }> = Array.from({ length: 7 }, () => ({
    sessions: 0,
    completed: 0,
  }));
  for (const d of analytics.daily_trends) {
    const sessions = d.sessions ?? 0;
    if (sessions === 0) continue;
    // daily_trends.day is YYYY-MM-DD UTC. Use Date constructor with
    // explicit ISO + 'T00:00Z' so the DOW resolves consistently
    // regardless of viewer locale offset; the analytics layer already
    // groups by the user's local day so this preserves their bucket.
    const date = new Date(`${d.day}T00:00:00Z`);
    const dow = date.getUTCDay();
    buckets[dow].sessions += sessions;
    buckets[dow].completed += d.completed ?? 0;
  }

  const rows: DowDipRow[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const b = buckets[dow];
    if (b.sessions === 0) continue;
    rows.push({
      dow,
      sessions: b.sessions,
      rate: Math.round((b.completed / b.sessions) * 100),
    });
  }
  if (rows.length < DOW_DIP_MIN_DOW_COUNT) return null;
  const best = rows.reduce((a, b) => (b.rate > a.rate ? b : a));
  const worst = rows.reduce((a, b) => (b.rate < a.rate ? b : a));
  if (best.rate - worst.rate < DOW_DIP_MIN_DELTA) return null;
  return { rows, best, worst };
}

function DowDipViz({ rows }: { rows: DowDipRow[] }) {
  // Align to all 7 DOWs even when only 5+ have data, keeps the visual
  // pattern legible when a couple of days are missing. Empty days
  // render as ghost columns via `rate: null` and `volume: 0`.
  const byDow = new Map(rows.map((r) => [r.dow, r]));
  return (
    <RateVolumeColumns
      legend={null}
      columns={[0, 1, 2, 3, 4, 5, 6].map((dow) => {
        const r = byDow.get(dow);
        return {
          key: dow,
          label: DAY_LABELS[dow],
          rateLabel: r ? `${r.rate}%` : '-',
          volume: r ? r.sessions : 0,
          rate: r ? r.rate : null,
          title: r
            ? `${DAY_LABELS[dow]}: ${r.sessions} sessions, ${r.rate}% completed`
            : `${DAY_LABELS[dow]}: no sessions`,
        };
      })}
    />
  );
}
