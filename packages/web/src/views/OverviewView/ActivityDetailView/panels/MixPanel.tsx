import { type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  BreakdownList,
  BreakdownMeta,
  DivergingColumns,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { workTypeColor } from '../../../../widgets/utils.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';
import shared from '../../../../widgets/widget-shared.module.css';

import { fmtCount } from '../format.js';
import styles from '../ActivityDetailView.module.css';

export function MixPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const workTypes = analytics.work_type_distribution;
  const totalEdits = workTypes.reduce((s, w) => s + w.edits, 0);

  if (totalEdits === 0) {
    return (
      <span className={styles.empty}>
        Work-type mix appears once sessions touch files. Each edit gets a single work_type via path
        heuristics.
      </span>
    );
  }

  // Sort by edits desc so the proportional bar reads largest-to-smallest
  // left-to-right and the legend mirrors the bar ordering.
  const sorted = [...workTypes].sort((a, b) => b.edits - a.edits);
  const top = sorted[0];
  const second = sorted[1];

  // Q1 share
  const shareAnswer = (
    <>
      <Metric>{top.work_type}</Metric> takes{' '}
      <Metric>{Math.round((top.edits / totalEdits) * 100)}%</Metric> of edits
      {second ? (
        <>
          , <Metric>{second.work_type}</Metric>{' '}
          <Metric>{Math.round((second.edits / totalEdits) * 100)}%</Metric>
        </>
      ) : null}
      . <Metric>{sorted.length}</Metric> work types touched in this window.
    </>
  );

  // Q2 lines-by-type
  const churnRows = sorted
    .filter((w) => w.lines_added + w.lines_removed > 0)
    .map((w) => ({
      day: w.work_type,
      added: w.lines_added,
      removed: w.lines_removed,
    }));
  const linesLeader = churnRows.reduce<(typeof churnRows)[number] | null>(
    (best, r) => (best === null || r.added + r.removed > best.added + best.removed ? r : best),
    null,
  );
  const linesAnswer =
    linesLeader != null ? (
      <>
        <Metric>{linesLeader.day}</Metric> shipped{' '}
        <Metric tone="positive">+{fmtCount(linesLeader.added)}</Metric> /{' '}
        <Metric tone="negative">−{fmtCount(linesLeader.removed)}</Metric> lines, the largest churn
        this period.
      </>
    ) : null;

  // Q3 files-per-type
  const filesRows = sorted.filter((w) => w.files > 0);
  const editsPerFileMedian = (() => {
    if (filesRows.length === 0) return 0;
    const ratios = filesRows.map((w) => w.edits / Math.max(1, w.files)).sort((a, b) => a - b);
    const mid = Math.floor(ratios.length / 2);
    return ratios.length % 2 === 0 ? (ratios[mid - 1] + ratios[mid]) / 2 : ratios[mid];
  })();
  const topFiles = filesRows[0];
  const topEditsPerFile = topFiles ? topFiles.edits / Math.max(1, topFiles.files) : 0;
  const topShape = topEditsPerFile > editsPerFileMedian ? 'focused' : 'broad';
  const filesAnswer =
    filesRows.length > 0 && topFiles ? (
      <>
        <Metric>{topFiles.work_type}</Metric> spans <Metric>{fmtCount(topFiles.files)}</Metric>{' '}
        files at <Metric>{topEditsPerFile.toFixed(1)}</Metric> edits per file,{' '}
        <Metric>{topShape}</Metric>.
      </>
    ) : null;

  const questions: FocusedQuestion[] = [
    {
      id: 'share',
      question: 'What kind of work fills your week?',
      answer: shareAnswer,
      children: <MixShareViz workTypes={sorted} totalEdits={totalEdits} />,
      relatedLinks: getCrossLinks('activity', 'mix', 'share'),
    },
  ];

  if (linesAnswer && churnRows.length > 0) {
    questions.push({
      id: 'lines-by-type',
      question: 'Where is the codebase changing most?',
      answer: linesAnswer,
      children: <DivergingColumns data={churnRows} height={160} showAxis />,
    });
  } else {
    // Honest empty for commit-tracking-gated tools, no fake bars per spec.
    questions.push({
      id: 'lines-by-type',
      question: 'Where is the codebase changing most?',
      answer: (
        <>
          No line-level churn captured in this window. Commit tracking is required to fill this in.
        </>
      ),
      children: <span className={styles.empty}>Line-level churn requires commit tracking.</span>,
    });
  }

  if (filesAnswer && filesRows.length > 0) {
    questions.push({
      id: 'files-per-type',
      question: 'How spread is each work type?',
      answer: filesAnswer,
      children: (
        <BreakdownList
          items={filesRows.map((w) => {
            const epf = w.edits / Math.max(1, w.files);
            const maxEpf = Math.max(...filesRows.map((x) => x.edits / Math.max(1, x.files)), 1);
            return {
              key: w.work_type,
              label: w.work_type,
              fillPct: (epf / maxEpf) * 100,
              fillColor: workTypeColor(w.work_type),
              value: (
                <>
                  {epf.toFixed(1)} edits/file
                  <BreakdownMeta>
                    {' · '}
                    {fmtCount(w.files)} files · {fmtCount(w.edits)} edits
                  </BreakdownMeta>
                </>
              ),
            };
          })}
        />
      ),
    });
  } else {
    questions.push({
      id: 'files-per-type',
      question: 'How spread is each work type?',
      answer: <>Files-per-type appears once edits land on tracked files.</>,
      children: (
        <span className={styles.empty}>
          Files-per-type appears once edits land on tracked files.
        </span>
      ),
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

function MixShareViz({
  workTypes,
  totalEdits,
}: {
  workTypes: UserAnalytics['work_type_distribution'];
  totalEdits: number;
}) {
  const visible = workTypes
    .map((w) => ({ w, pct: (w.edits / totalEdits) * 100 }))
    .filter(({ pct }) => pct >= 1);
  return (
    <>
      <div className={`${shared.workBar} ${styles.mixBar}`}>
        {visible.map(({ w, pct }) => (
          <div
            key={w.work_type}
            className={shared.workSegment}
            style={{
              width: `${pct}%`,
              background: workTypeColor(w.work_type),
            }}
            title={`${w.work_type}: ${Math.round(pct)}% of edits`}
          />
        ))}
      </div>
      <div className={styles.mixLegend}>
        {visible.map(({ w, pct }, i) => (
          <div
            key={w.work_type}
            className={styles.mixRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.mixLabel}>
              <span className={styles.mixDot} style={{ background: workTypeColor(w.work_type) }} />
              {w.work_type}
            </span>
            <span className={styles.mixShare}>{Math.round(pct)}%</span>
            <span className={styles.mixMeta}>
              {fmtCount(w.edits)} edits · {fmtCount(w.files)} files
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
