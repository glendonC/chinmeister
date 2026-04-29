import { type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { workTypeColor } from '../../../../widgets/utils.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../OutcomesDetailView.module.css';

export function WorkTypesPanel({ analytics }: { analytics: UserAnalytics }) {
  const wto = analytics.work_type_outcomes;
  const wtActiveId = useQueryParam('q');

  if (wto.length === 0) {
    return (
      <span className={styles.empty}>
        Appears after sessions touch files. Each session is assigned its primary work type from the
        file set.
      </span>
    );
  }

  const worst = [...wto].sort((a, b) => a.completion_rate - b.completion_rate)[0];
  const best = [...wto].sort((a, b) => b.completion_rate - a.completion_rate)[0];

  const worstTone = worst.completion_rate < 40 ? 'negative' : 'warning';
  const answer = (
    <>
      <Metric>{best.work_type}</Metric> completes at{' '}
      <Metric tone="positive">{best.completion_rate}%</Metric>; <Metric>{worst.work_type}</Metric>{' '}
      trails at <Metric tone={worstTone}>{worst.completion_rate}%</Metric>.
    </>
  );

  const maxRate = Math.max(...wto.map((x) => x.completion_rate), 1);
  const questions: FocusedQuestion[] = [
    {
      id: 'finish',
      question: 'Which kinds of work finish?',
      answer,
      children: (
        <div className={styles.wtList}>
          {wto.map((w, i) => (
            <div
              key={w.work_type}
              className={styles.wtRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.wtLabel}>{w.work_type}</span>
              <div className={styles.wtBarTrack}>
                <div
                  className={styles.wtBarFill}
                  style={{
                    width: `${(w.completion_rate / maxRate) * 100}%`,
                    background: workTypeColor(w.work_type),
                  }}
                />
              </div>
              <span className={styles.wtValue}>
                {w.completion_rate}%
                <span className={styles.wtValueSoft}>{fmtCount(w.sessions)} sessions</span>
              </span>
            </div>
          ))}
        </div>
      ),
      relatedLinks: getCrossLinks('outcomes', 'types', 'finish'),
    },
  ];

  return (
    <FocusedDetailView
      questions={questions}
      activeId={wtActiveId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}
