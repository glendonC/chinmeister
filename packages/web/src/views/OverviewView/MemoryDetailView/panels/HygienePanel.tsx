import { type CSSProperties } from 'react';
import clsx from 'clsx';

import {
  FocusedDetailView,
  Metric,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { formatRelativeTime } from '../../../../lib/relativeTime.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../MemoryDetailView.module.css';

const HYGIENE_EVENT_LIMIT = 20;

function pickEventTimestamp(event: { proposed_at: string; decided_at: string | null }): string {
  // Prefer decided_at when present so resolved proposals reflect the
  // outcome moment, not the older proposal moment.
  if (event.decided_at && event.decided_at > event.proposed_at) return event.decided_at;
  return event.proposed_at;
}

function statusToneClass(status: string): string | undefined {
  const normalized = status.toLowerCase();
  if (normalized === 'applied' || normalized === 'accepted' || normalized === 'merged') {
    return styles.hygieneStatusApplied;
  }
  if (normalized === 'rejected' || normalized === 'discarded') {
    return styles.hygieneStatusRejected;
  }
  return undefined;
}

// Quiet today by design. Empty states explain the cadence honestly; once
// consolidation runs, the same shape fills in.
export function HygienePanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const s = analytics.memory_supersession;
  const events = analytics.memory_supersession_events ?? [];
  const recentEvents = [...events]
    .sort((a, b) => pickEventTimestamp(b).localeCompare(pickEventTimestamp(a)))
    .slice(0, HYGIENE_EVENT_LIMIT);
  const newest = recentEvents[0];
  const newestRelative = newest ? formatRelativeTime(pickEventTimestamp(newest)) : null;

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
    <>No invalidations, merges, or pending proposals in this window.</>
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
          Nothing is waiting for review, and no memories were invalidated or merged in this window.
        </span>
      ),
    },
    {
      id: 'events',
      question: "What's been moving through consolidation?",
      answer:
        recentEvents.length > 0 ? (
          <>
            <Metric>{fmtCount(recentEvents.length)}</Metric>{' '}
            {recentEvents.length === 1 ? 'event' : 'events'} on the queue
            {newestRelative != null && (
              <>
                ; latest <Metric>{newestRelative}</Metric>
              </>
            )}
            .
          </>
        ) : (
          <>No consolidation activity yet.</>
        ),
      children:
        recentEvents.length > 0 ? (
          <div className={styles.hygieneTimeline}>
            {recentEvents.map((event, i) => {
              const stamp = pickEventTimestamp(event);
              const when = formatRelativeTime(stamp);
              return (
                <div
                  key={event.id}
                  className={styles.hygieneRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <span className={clsx(styles.hygieneStatus, statusToneClass(event.status))}>
                    {event.status}
                  </span>
                  <span className={styles.hygieneKind}>{event.kind}</span>
                  <span className={styles.hygieneSpacer} />
                  <span className={styles.hygieneWhen}>{when ?? stamp}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <span className={styles.empty}>No consolidation activity yet.</span>
        ),
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
