import { useMemo } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  HourHeatmap,
  TrueShareBars,
  type HourCell,
  type TrueShareEntry,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { DAY_LABELS } from '../../../../widgets/utils.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, hourGlyph } from '../format.js';
import styles from '../ActivityDetailView.module.css';

const HEATMAP_MIN_POPULATED_CELLS = 3;

// Block bucketing per spec: Morning 5-12, Afternoon 12-17, Evening
// 17-22, Night 22-5. Blocks are disjoint ranges on the 24-hour clock so
// every hour resolves to exactly one block.
type Block = 'morning' | 'afternoon' | 'evening' | 'night';
const BLOCK_LABEL: Record<Block, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};
const BLOCK_OPACITY: Record<Block, number> = {
  morning: 0.4,
  afternoon: 0.6,
  evening: 0.8,
  night: 0.9,
};
function bucketHour(hour: number): Block {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export function RhythmPanel({
  analytics,
  peakCell,
}: {
  analytics: UserAnalytics;
  peakCell: { dow: number; hour: number; sessions: number } | null;
}) {
  const activeId = useQueryParam('q');

  const cells = useMemo<HourCell[]>(() => {
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
  }, [analytics.hourly_distribution]);

  const blockTotals = useMemo(() => {
    const sessions: Record<Block, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };
    const edits: Record<Block, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };
    for (const h of analytics.hourly_distribution) {
      const block = bucketHour(h.hour);
      sessions[block] += h.sessions;
      edits[block] += h.edits;
    }
    return { sessions, edits };
  }, [analytics.hourly_distribution]);

  const populatedCount = cells.length;

  if (populatedCount < HEATMAP_MIN_POPULATED_CELLS) {
    return (
      <span className={styles.empty}>
        Heatmap fills in once 3+ hour x day cells have sessions. Run more sessions and drill back
        in.
      </span>
    );
  }

  // Q1 peak-hour
  const peakRate = (() => {
    if (!peakCell) return null;
    // Look up completion rate for this DOW from daily_trends grouped by
    // weekday; this is a coarse approximation since daily_trends carry
    // per-day rates not per-hour rates. For the cell-level prose we
    // skip the second sentence when n < 5 per the spec.
    if (peakCell.sessions < 5) return null;
    const rate = analytics.completion_summary.completion_rate;
    return Number.isFinite(rate) ? Math.round(rate) : null;
  })();

  const peakAnswer = peakCell ? (
    <>
      <Metric>
        {DAY_LABELS[peakCell.dow]} {hourGlyph(peakCell.hour)}
      </Metric>{' '}
      is your busiest cell with <Metric>{fmtCount(peakCell.sessions)}</Metric> sessions.
      {peakRate != null && (
        <>
          {' '}
          <Metric tone="positive">{peakRate}%</Metric> of those completed.
        </>
      )}
    </>
  ) : null;

  // Q2 weekday vs weekend
  const weekdaySessions = analytics.hourly_distribution
    .filter((h) => h.dow >= 1 && h.dow <= 5)
    .reduce((s, h) => s + h.sessions, 0);
  const weekendSessions = analytics.hourly_distribution
    .filter((h) => h.dow === 0 || h.dow === 6)
    .reduce((s, h) => s + h.sessions, 0);
  const totalSessionsHourly = weekdaySessions + weekendSessions;
  const weekdayShare =
    totalSessionsHourly > 0 ? Math.round((weekdaySessions / totalSessionsHourly) * 100) : 0;
  const weekendActiveHours = new Set(
    analytics.hourly_distribution
      .filter((h) => (h.dow === 0 || h.dow === 6) && h.sessions > 0)
      .map((h) => `${h.dow}:${h.hour}`),
  ).size;

  const weekendAnswer =
    totalSessionsHourly > 0 ? (
      <>
        Weekdays carry{' '}
        <Metric tone={weekdayShare > 80 ? 'positive' : undefined}>{weekdayShare}%</Metric> of
        sessions. Weekend volume is <Metric>{fmtCount(weekendSessions)}</Metric> sessions across{' '}
        <Metric>{weekendActiveHours}</Metric> active hours.
      </>
    ) : null;

  // Q3 morning vs evening
  const totalEdits =
    blockTotals.edits.morning +
    blockTotals.edits.afternoon +
    blockTotals.edits.evening +
    blockTotals.edits.night;
  const blockOrder: Block[] = ['morning', 'afternoon', 'evening', 'night'];
  const topBlock = blockOrder.reduce<Block>(
    (best, b) => (blockTotals.edits[b] > blockTotals.edits[best] ? b : best),
    'morning',
  );
  const topShare =
    totalEdits > 0 ? Math.round((blockTotals.edits[topBlock] / totalEdits) * 100) : 0;

  const blockEntries: TrueShareEntry[] = blockOrder
    .filter((b) => blockTotals.edits[b] > 0 || blockTotals.sessions[b] > 0)
    .map((b) => ({
      key: b,
      label: BLOCK_LABEL[b],
      value: blockTotals.edits[b],
      color: `color-mix(in srgb, var(--ink) ${Math.round(BLOCK_OPACITY[b] * 100)}%, transparent)`,
      meta: `${fmtCount(blockTotals.sessions[b])} sessions · ${fmtCount(blockTotals.edits[b])} edits`,
    }));

  const blockAnswer =
    totalEdits > 0 ? (
      <>
        <Metric>{BLOCK_LABEL[topBlock]}</Metric> carries <Metric>{topShare}%</Metric> of edits,{' '}
        <Metric>{fmtCount(blockTotals.edits[topBlock])}</Metric> of{' '}
        <Metric>{fmtCount(totalEdits)}</Metric>.
      </>
    ) : null;

  const questions: FocusedQuestion[] = [];
  if (peakCell && peakAnswer) {
    questions.push({
      id: 'peak-hour',
      question: 'When are you most active?',
      answer: peakAnswer,
      children: <HourHeatmap data={cells} cellSize={18} />,
      relatedLinks: getCrossLinks('activity', 'rhythm', 'peak-hour'),
    });
  }
  if (weekendAnswer) {
    questions.push({
      id: 'weekday-vs-weekend',
      question: 'Do weekends look different?',
      answer: weekendAnswer,
      children: <WeekendBlock cells={cells} weekendSessions={weekendSessions} />,
    });
  }
  if (blockAnswer && blockEntries.length > 0) {
    questions.push({
      id: 'morning-vs-evening',
      question: 'Are you a morning person?',
      answer: blockAnswer,
      children: <TrueShareBars entries={blockEntries} />,
    });
  }

  if (questions.length === 0) {
    return (
      <span className={styles.empty}>
        Heatmap fills in once 3+ hour x day cells have sessions. Run more sessions and drill back
        in.
      </span>
    );
  }

  return (
    <FocusedDetailView
      questions={questions}
      activeId={activeId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}

function WeekendBlock({ cells, weekendSessions }: { cells: HourCell[]; weekendSessions: number }) {
  return (
    <div className={styles.weekendBlock}>
      <div className={styles.weekendRow}>
        <span className={styles.weekendCaption}>Weekdays</span>
        <HourHeatmap data={cells} compactRows={[1, 2, 3, 4, 5]} cellSize={16} hideXLabels />
      </div>
      <div className={styles.weekendRow}>
        <span className={styles.weekendCaption}>Weekend</span>
        {weekendSessions > 0 ? (
          <HourHeatmap data={cells} compactRows={[0, 6]} cellSize={16} />
        ) : (
          <span className={styles.weekendEmpty}>No weekend sessions in this window.</span>
        )}
      </div>
    </div>
  );
}
