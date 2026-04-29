import { type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../MemoryDetailView.module.css';

// Quiet today by design. Empty states explain the cadence honestly; once
// consolidation runs, the same shape fills in.
export function HygienePanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const s = analytics.memory_supersession;
  const cats = analytics.memory_categories;

  const hasFlow = s.invalidated_period > 0 || s.merged_period > 0 || s.pending_proposals > 0;

  const flowAnswer = hasFlow ? (
    <>
      <Metric>{fmtCount(s.invalidated_period)}</Metric> invalidated,{' '}
      <Metric>{fmtCount(s.merged_period)}</Metric> merged,{' '}
      <Metric tone={s.pending_proposals > 0 ? 'warning' : 'neutral'}>
        {fmtCount(s.pending_proposals)}
      </Metric>{' '}
      waiting for review.
    </>
  ) : (
    <>Memory Hygiene Autopilot runs consolidation when it ships.</>
  );

  const questions: FocusedQuestion[] = [
    {
      id: 'flow',
      question: "What's moving through consolidation?",
      answer: flowAnswer,
      children: hasFlow ? (
        <div className={styles.statRow}>
          <div className={styles.statBlock}>
            <span className={styles.statBlockValue}>{fmtCount(s.invalidated_period)}</span>
            <span className={styles.statBlockLabel}>invalidated</span>
          </div>
          <div className={styles.statBlock}>
            <span className={styles.statBlockValue}>{fmtCount(s.merged_period)}</span>
            <span className={styles.statBlockLabel}>merged</span>
          </div>
          <div className={styles.statBlock}>
            <span
              className={styles.statBlockValue}
              style={
                s.pending_proposals > 0 ? ({ color: 'var(--warn)' } as CSSProperties) : undefined
              }
            >
              {fmtCount(s.pending_proposals)}
            </span>
            <span className={styles.statBlockLabel}>pending review</span>
          </div>
        </div>
      ) : (
        <span className={styles.empty}>
          Memory Hygiene Autopilot runs consolidation when it ships.
        </span>
      ),
    },
    {
      id: 'categories',
      question: 'Which categories supersede most?',
      answer:
        cats.length > 0 ? (
          <>
            <Metric>{cats[0].category}</Metric> leads by volume; supersession-by-category unlocks
            once consolidation runs on cadence.
          </>
        ) : (
          <>Category supersession leaderboard ships with Memory Hygiene Autopilot.</>
        ),
      children: <span className={styles.empty}>Counters move when consolidation runs.</span>,
    },
  ];

  return (
    <div className={styles.panel}>
      <FocusedDetailView
        questions={questions}
        activeId={activeId}
        onSelect={(id) => setQueryParam('q', id)}
      />
    </div>
  );
}
