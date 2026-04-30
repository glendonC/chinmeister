import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { RateBars } from '../../../../components/viz/index.js';
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

  const questions: FocusedQuestion[] = [
    {
      id: 'finish',
      question: 'Which kinds of work finish?',
      answer,
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
