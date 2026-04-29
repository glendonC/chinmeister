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

const AGE_COLORS: Record<string, string> = {
  '0-7d': 'var(--success)',
  '8-30d': 'var(--soft)',
  '31-90d': 'var(--warn)',
  '90d+': 'var(--ghost)',
};

// Aging composition, presented as a proportional bar with a hero share
// inline above it (readable at 1s), followed by an accumulating-vs-
// replacing read across the four buckets.
export function FreshnessPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const a = analytics.memory_aging;
  const total = a.recent_7d + a.recent_30d + a.recent_90d + a.older;

  if (total === 0) {
    return (
      <div className={styles.panel}>
        <span className={styles.empty}>Aging curve appears after the team saves memories.</span>
      </div>
    );
  }

  const buckets: Array<{ key: string; label: string; count: number }> = [
    { key: '0-7d', label: '0-7 days', count: a.recent_7d },
    { key: '8-30d', label: '8-30 days', count: a.recent_30d },
    { key: '31-90d', label: '31-90 days', count: a.recent_90d },
    { key: '90d+', label: '90+ days', count: a.older },
  ];

  const under30Pct = Math.round(((a.recent_7d + a.recent_30d) / total) * 100);
  const over90Pct = Math.round((a.older / total) * 100);

  const mixAnswer = (
    <>
      <Metric tone={under30Pct >= 50 ? 'positive' : 'warning'}>{under30Pct}%</Metric> of live
      memories are under 30 days old;{' '}
      <Metric tone={over90Pct >= 30 ? 'warning' : 'neutral'}>{over90Pct}%</Metric> are over 90.
    </>
  );

  // Q2 accumulation: derived sentence comparing 0-7d vs 90d+. Viz is a
  // 4-segment vertical strip with explicit count labels so the reader
  // sees front-vs-back weight without summing legend rows.
  const fresh = a.recent_7d;
  const old = a.older;
  let accumSentence: string;
  let accumTone: 'positive' | 'warning' | 'neutral';
  if (fresh + old < 4) {
    accumSentence = 'Need at least a few populated buckets to read the trend.';
    accumTone = 'neutral';
  } else if (fresh > old * 1.5) {
    accumSentence = 'Newer memories are outpacing old ones, replacement working.';
    accumTone = 'positive';
  } else if (old > fresh * 1.5) {
    accumSentence = 'Old memories dominate; pruning lags.';
    accumTone = 'warning';
  } else {
    accumSentence = 'New and old roughly balanced, accumulation rather than replacement.';
    accumTone = 'neutral';
  }
  const accumAnswer = <Metric tone={accumTone}>{accumSentence}</Metric>;

  const questions: FocusedQuestion[] = [
    {
      id: 'mix',
      question: "How fresh is the team's living memory?",
      answer: mixAnswer,
      children: (
        <div className={styles.agingFrame}>
          <div className={styles.agingHero}>
            <span className={styles.agingHeroValue}>{under30Pct}</span>
            <span className={styles.agingHeroUnit}>%</span>
            <span className={styles.agingHeroLabel}>under 30 days</span>
          </div>
          <div className={styles.agingBar}>
            {buckets.map((b) => {
              const pct = (b.count / total) * 100;
              if (pct < 1) return null;
              return (
                <div
                  key={b.key}
                  className={styles.agingSegment}
                  style={{
                    width: `${pct}%`,
                    background: AGE_COLORS[b.key],
                  }}
                  title={`${b.label}: ${Math.round(pct)}% (${b.count})`}
                />
              );
            })}
          </div>
          <div className={styles.agingLegend}>
            {buckets.map((b, i) => {
              const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
              return (
                <div
                  key={b.key}
                  className={styles.agingLegendRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <span className={styles.agingDot} style={{ background: AGE_COLORS[b.key] }} />
                  <span className={styles.agingLegendLabel}>{b.label}</span>
                  <span className={styles.agingLegendValue}>
                    {pct}% · {fmtCount(b.count)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      id: 'accumulation',
      question: 'Are we replacing or accumulating?',
      answer: accumAnswer,
      children: (
        <div className={styles.accumStrip}>
          {buckets.map((b, i) => {
            const pct = (b.count / total) * 100;
            return (
              <div
                key={b.key}
                className={styles.accumColumn}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.accumValue}>{fmtCount(b.count)}</span>
                <div
                  className={styles.accumBar}
                  style={{
                    height: `${Math.max(4, pct)}%`,
                    background: AGE_COLORS[b.key],
                  }}
                  title={`${b.label}: ${b.count}`}
                />
                <span className={styles.accumLabel}>{b.label}</span>
              </div>
            );
          })}
        </div>
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
