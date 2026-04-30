import { useMemo } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  BreakdownList,
  BreakdownMeta,
  RateStrip,
  type RateEntry,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';
import { capabilityCoverageNote, CoverageNote } from '../../../../widgets/bodies/shared.js';

import { fmtCount, completionTone } from '../format.js';
import styles from '../ToolsDetailView.module.css';

export function FlowPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const handoffs = analytics.tool_handoffs;
  const questionHandoffs = analytics.cross_tool_handoff_questions;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const conversationNote = capabilityCoverageNote(tools, 'conversationLogs');

  // All hooks must run before any early return.
  const sortedByCount = useMemo(
    () => [...handoffs].sort((a, b) => b.file_count - a.file_count),
    [handoffs],
  );
  // Q2 gap: RateStrip per pair. Rate is gap-minutes; weight is file count
  // so heavier handoffs get larger dots. Suppressed when fewer than 2
  // handoffs (per spec edge guard).
  const gapEntries: RateEntry[] = useMemo(
    () =>
      sortedByCount.slice(0, 12).map((h) => {
        const fromMeta = getToolMeta(h.from_tool);
        const toMeta = getToolMeta(h.to_tool);
        return {
          key: `${h.from_tool}-${h.to_tool}`,
          label: (
            <span className={styles.pairLabel}>
              <span className={styles.pairDot} style={{ background: fromMeta.color }} />
              <span className={styles.pairText}>{fromMeta.label}</span>
              <span className={styles.pairArrow}>→</span>
              <span className={styles.pairDot} style={{ background: toMeta.color }} />
              <span className={styles.pairText}>{toMeta.label}</span>
            </span>
          ),
          rate: h.avg_gap_minutes,
          weight: h.file_count,
        };
      }),
    [sortedByCount],
  );

  if (handoffs.length === 0 && questionHandoffs.length === 0) {
    const toolCount = analytics.tool_comparison.length;
    const message =
      toolCount <= 1
        ? 'Add a second tool with `chinmeister add <tool>` to see how agents hand off files.'
        : 'No cross-tool handoffs yet, agents are staying within one tool.';
    return (
      <div className={styles.panel}>
        <span className={styles.empty}>{message}</span>
        <CoverageNote text={conversationNote} />
      </div>
    );
  }

  const topPair = sortedByCount[0];
  const totalEdges = handoffs.length;
  const distinctPairs = new Set(handoffs.map((h) => [h.from_tool, h.to_tool].sort().join('|')))
    .size;
  const totalFiles = handoffs.reduce((s, h) => s + h.file_count, 0);
  const maxFiles = Math.max(...handoffs.map((h) => h.file_count), 1);

  // Q1 pairs: BreakdownList fallback for the chord viz (per spec reach
  // guardrail). Each row label composes [from-dot] from -> [to-dot] to
  // with brand colors. Bar value is file count, completion rate surfaces
  // as muted meta text, NOT used to colorize the bar (the bar carries
  // the brand of the source tool to keep the visual grouped on origin).
  const pairsAnswer = topPair ? (
    <>
      <Metric>
        {getToolMeta(topPair.from_tool).label} → {getToolMeta(topPair.to_tool).label}
      </Metric>{' '}
      moved <Metric>{fmtCount(topPair.file_count)}</Metric> files at{' '}
      <Metric tone={completionTone(topPair.handoff_completion_rate)}>
        {topPair.handoff_completion_rate}%
      </Metric>{' '}
      completion. Across all pairs: <Metric>{fmtCount(totalEdges)}</Metric> handoffs in{' '}
      <Metric>{fmtCount(distinctPairs)}</Metric> directions.
    </>
  ) : null;

  const inSession = handoffs.filter((h) => h.avg_gap_minutes < 5).length;
  const sortedGaps = [...handoffs.map((h) => h.avg_gap_minutes)].sort((a, b) => a - b);
  const medianGap =
    sortedGaps.length === 0
      ? 0
      : sortedGaps.length % 2 === 0
        ? (sortedGaps[sortedGaps.length / 2 - 1] + sortedGaps[sortedGaps.length / 2]) / 2
        : sortedGaps[Math.floor(sortedGaps.length / 2)];

  const gapAnswer = (
    <>
      Median gap between tools is <Metric>{medianGap.toFixed(1)} min</Metric>
      {inSession > 0 && (
        <>
          , most handoffs (<Metric>{fmtCount(inSession)}</Metric>) happen inside the same session.
        </>
      )}
      .
    </>
  );

  const questions: FocusedQuestion[] = [];
  if (pairsAnswer) {
    questions.push({
      id: 'pairs',
      question: 'Which tool pairs are passing files most?',
      answer: pairsAnswer,
      children: (
        <BreakdownList
          items={sortedByCount.slice(0, 12).map((h) => {
            const fromMeta = getToolMeta(h.from_tool);
            const toMeta = getToolMeta(h.to_tool);
            const share = totalFiles > 0 ? Math.round((h.file_count / totalFiles) * 100) : 0;
            return {
              key: `${h.from_tool}-${h.to_tool}`,
              label: (
                <span className={styles.pairLabel}>
                  <span className={styles.pairDot} style={{ background: fromMeta.color }} />
                  <span className={styles.pairText}>{fromMeta.label}</span>
                  <span className={styles.pairArrow}>→</span>
                  <span className={styles.pairDot} style={{ background: toMeta.color }} />
                  <span className={styles.pairText}>{toMeta.label}</span>
                </span>
              ),
              fillPct: (h.file_count / maxFiles) * 100,
              fillColor: fromMeta.color,
              value: (
                <>
                  {fmtCount(h.file_count)} files
                  <BreakdownMeta>
                    {' · '}
                    {share}% · {h.handoff_completion_rate}% complete
                  </BreakdownMeta>
                </>
              ),
            };
          })}
        />
      ),
      relatedLinks: getCrossLinks('tools', 'flow', 'pairs'),
    });
  }

  if (handoffs.length >= 2) {
    questions.push({
      id: 'gap',
      question: 'How fast does the handoff happen?',
      answer: gapAnswer,
      children: (
        <RateStrip
          entries={gapEntries}
          format={(n) => `${n.toFixed(1)} min`}
          metaFormat={(n) => `${fmtCount(n)} files`}
        />
      ),
    });
  }

  // Q3 timing-distribution. The Q2 RateStrip surfaces per-pair gap times
  // but doesn't answer the shape question: do most handoffs flow inside
  // the same session, or across hour-scale gaps. Bucket every handoff by
  // its avg_gap_minutes and weight each bucket by file_count so the
  // distribution reflects work volume, not the number of distinct pairs.
  // Buckets pick the natural session-shape boundaries: in-session (<5m),
  // short break (5-30m), context-shift (30m-2h), next-cycle (2h+).
  const gapBuckets = (() => {
    const buckets = [
      { key: 'in-session', label: 'in session', min: 0, max: 5 },
      { key: 'short-break', label: '5 to 30 min', min: 5, max: 30 },
      { key: 'context-shift', label: '30 min to 2 hr', min: 30, max: 120 },
      { key: 'next-cycle', label: '2 hr or more', min: 120, max: Infinity },
    ];
    const totals = buckets.map((b) => ({
      ...b,
      file_count: handoffs
        .filter((h) => h.avg_gap_minutes >= b.min && h.avg_gap_minutes < b.max)
        .reduce((s, h) => s + h.file_count, 0),
    }));
    return totals;
  })();
  const gapTotal = gapBuckets.reduce((s, b) => s + b.file_count, 0);
  if (gapTotal > 0 && handoffs.length >= 2) {
    const dominant = [...gapBuckets].sort((a, b) => b.file_count - a.file_count)[0];
    const dominantShare = Math.round((dominant.file_count / gapTotal) * 100);
    const distributionAnswer = (
      <>
        <Metric>{dominantShare}%</Metric> of cross-tool files moved{' '}
        <Metric>{dominant.label}</Metric> across <Metric>{fmtCount(gapTotal)}</Metric> handoff files
        in total.
      </>
    );
    questions.push({
      id: 'timing-distribution',
      question: 'Are handoffs in-session or across breaks?',
      answer: distributionAnswer,
      children: (
        <BreakdownList
          items={gapBuckets.map((b) => ({
            key: b.key,
            label: <span className={styles.pairText}>{b.label}</span>,
            fillPct: gapTotal > 0 ? (b.file_count / gapTotal) * 100 : 0,
            value: (
              <>
                {fmtCount(b.file_count)} files
                <BreakdownMeta>
                  {' · '}
                  {gapTotal > 0 ? Math.round((b.file_count / gapTotal) * 100) : 0}%
                </BreakdownMeta>
              </>
            ),
          }))}
        />
      ),
    });
  }

  if (questionHandoffs.length > 0) {
    const topQuestionHandoff = questionHandoffs[0];
    const fromMeta = getToolMeta(topQuestionHandoff.tool_from);
    const toMeta = getToolMeta(topQuestionHandoff.tool_to);
    const maxGap = Math.max(...questionHandoffs.map((h) => h.gap_minutes), 1);
    questions.push({
      id: 'question-handoffs',
      question: 'Which abandoned questions crossed tools?',
      answer: (
        <>
          <Metric>
            {fromMeta.label} → {toMeta.label}
          </Metric>{' '}
          picked up <Metric>{topQuestionHandoff.file}</Metric> after{' '}
          <Metric>{formatGap(topQuestionHandoff.gap_minutes)}</Metric>.
        </>
      ),
      children: (
        <>
          <BreakdownList
            items={questionHandoffs.slice(0, 12).map((h) => {
              const source = getToolMeta(h.tool_from);
              const target = getToolMeta(h.tool_to);
              return {
                key: `${h.handoff_at}-${h.file}-${h.tool_from}-${h.tool_to}`,
                label: (
                  <span className={styles.pairLabel}>
                    <span className={styles.pairDot} style={{ background: source.color }} />
                    <span className={styles.pairText}>{source.label}</span>
                    <span className={styles.pairArrow}>→</span>
                    <span className={styles.pairDot} style={{ background: target.color }} />
                    <span className={styles.pairText}>{target.label}</span>
                  </span>
                ),
                fillPct: Math.max(8, (h.gap_minutes / maxGap) * 100),
                fillColor: source.color,
                value: (
                  <>
                    {formatGap(h.gap_minutes)}
                    <BreakdownMeta>
                      {' · '}
                      {h.file}
                    </BreakdownMeta>
                  </>
                ),
              };
            })}
          />
          <CoverageNote text={conversationNote} />
        </>
      ),
    });
  } else {
    questions.push({
      id: 'question-handoffs',
      question: 'Which abandoned questions crossed tools?',
      answer: <>No abandoned-question handoffs crossed tools in this window.</>,
      children: (
        <>
          <span className={styles.empty}>
            These appear when a different tool picks up the same file after an abandoned question.
          </span>
          <CoverageNote text={conversationNote} />
        </>
      ),
    });
  }

  return (
    <div className={styles.panel}>
      <CoverageNote text={conversationNote} />
      <FocusedDetailView
        questions={questions}
        activeId={activeId}
        onSelect={(id) => setQueryParam('q', id)}
      />
    </div>
  );
}

function formatGap(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}
