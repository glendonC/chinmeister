import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { FlowRow } from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../MemoryDetailView.module.css';

// Author-consumer flow with twin micro-bars (memories actually read,
// reading sessions). Bar 1 max is the max memories_read across pairs;
// bar 2 max is the max reading_sessions, heterogeneous scales let the eye
// compare strengths within each axis without one number dwarfing the other.
export function CrossToolPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const flow = analytics.cross_tool_memory_flow;

  if (flow.length === 0) {
    return (
      <div className={styles.panel}>
        <span className={styles.empty}>
          Cross-tool flow appears once one tool&apos;s sessions read another tool&apos;s memories in
          this window.
        </span>
      </div>
    );
  }

  const sortedFlow = [...flow].sort((a, b) => b.memories_read - a.memories_read);
  const visible = sortedFlow.slice(0, 8);
  const maxReads = Math.max(...visible.map((f) => f.memories_read), 1);
  const maxSessions = Math.max(...visible.map((f) => f.reading_sessions), 1);

  const top = visible[0];
  const flowAnswer = top ? (
    <>
      <Metric>{getToolMeta(top.consumer_tool).label}</Metric> sessions read the most memories
      written by <Metric>{getToolMeta(top.author_tool).label}</Metric>,{' '}
      <Metric>{fmtCount(top.memories_read)}</Metric> distinct memories across{' '}
      <Metric>{fmtCount(top.reading_sessions)}</Metric> sessions.
    </>
  ) : null;

  const questions: FocusedQuestion[] = [
    {
      id: 'flow',
      question: 'Which tools share knowledge?',
      answer: flowAnswer ?? <>No author-consumer pairs in this window.</>,
      children: (
        <div className={styles.flowList}>
          {visible.map((f, i) => {
            const fromMeta = getToolMeta(f.author_tool);
            const toMeta = getToolMeta(f.consumer_tool);
            return (
              <FlowRow
                key={`${f.author_tool}|${f.consumer_tool}`}
                index={i}
                from={{ id: f.author_tool, label: fromMeta.label, color: fromMeta.color }}
                to={{ id: f.consumer_tool, label: toMeta.label, color: toMeta.color }}
                bars={[
                  {
                    label: 'memories read',
                    value: f.memories_read,
                    max: maxReads,
                    color: fromMeta.color,
                    display: fmtCount(f.memories_read),
                  },
                  {
                    label: 'reading sessions',
                    value: f.reading_sessions,
                    max: maxSessions,
                    display: fmtCount(f.reading_sessions),
                  },
                ]}
              />
            );
          })}
        </div>
      ),
      relatedLinks: getCrossLinks('memory', 'cross-tool', 'flow'),
    },
    {
      id: 'categories',
      question: 'Which categories cross tools?',
      answer: (
        <>Cross-tool category breakdown ships once the worker emits category arrays on flow rows.</>
      ),
      children: (
        <span className={styles.empty}>
          Needs a `cross_tool × category` cut on `cross_tool_memory_flow`. See the categories
          question on the Hygiene tab for the live category mix.
        </span>
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
