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
  RateBars,
  TrueShareBars,
  type TrueShareEntry,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { workTypeColor } from '../../../../widgets/utils.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

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

  // share
  const shareAnswer = (
    <>
      <Metric>{Math.round((top.edits / totalEdits) * 100)}%</Metric> of edits land in{' '}
      <Metric>{top.work_type}</Metric>
      {second ? (
        <>
          , <Metric>{Math.round((second.edits / totalEdits) * 100)}%</Metric> in{' '}
          <Metric>{second.work_type}</Metric>
        </>
      ) : null}
      . <Metric>{sorted.length}</Metric> work types touched in this window.
    </>
  );

  const shareEntries: TrueShareEntry[] = sorted
    .filter((w) => w.edits > 0)
    .map((w) => ({
      key: w.work_type,
      label: w.work_type,
      value: w.edits,
      color: workTypeColor(w.work_type),
      meta: `${fmtCount(w.files)} files`,
    }));

  // lines-by-type
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

  // files-per-type
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

  // completion-by-work-type. Mirrors OutcomesDetailView WorkTypesPanel so
  // the Mix tab carries both the volume share and the completion lens, with
  // a cross-link back to the canonical outcomes view.
  const wto = analytics.work_type_outcomes;
  const completionRows = wto.map((w) => ({
    key: w.work_type,
    label: w.work_type,
    rate: w.completion_rate,
    value: `${w.completion_rate}%`,
    sublabel: `${fmtCount(w.sessions)} sessions`,
    fillColor: workTypeColor(w.work_type),
  }));
  const bestCompletion =
    wto.length > 0 ? [...wto].sort((a, b) => b.completion_rate - a.completion_rate)[0] : null;
  const worstCompletion =
    wto.length > 0 ? [...wto].sort((a, b) => a.completion_rate - b.completion_rate)[0] : null;
  const completionAnswer =
    bestCompletion && worstCompletion ? (
      <>
        <Metric>{bestCompletion.work_type}</Metric> finishes at{' '}
        <Metric tone="positive">{bestCompletion.completion_rate}%</Metric>;{' '}
        <Metric>{worstCompletion.work_type}</Metric> trails at{' '}
        <Metric tone={worstCompletion.completion_rate < 40 ? 'negative' : 'warning'}>
          {worstCompletion.completion_rate}%
        </Metric>
        .
      </>
    ) : null;

  const questions: FocusedQuestion[] = [
    {
      id: 'share',
      question: 'What kind of work fills your week?',
      answer: shareAnswer,
      children: (
        <TrueShareBars entries={shareEntries} formatValue={(n) => `${fmtCount(n)} edits`} />
      ),
      relatedLinks: getCrossLinks('activity', 'mix', 'share'),
    },
  ];

  if (completionAnswer && completionRows.length > 0) {
    questions.push({
      id: 'completion',
      question: 'Which work types complete?',
      answer: completionAnswer,
      children: <RateBars labelWidth={120} rows={completionRows} />,
      relatedLinks: getCrossLinks('activity', 'mix', 'completion'),
    });
  }

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
