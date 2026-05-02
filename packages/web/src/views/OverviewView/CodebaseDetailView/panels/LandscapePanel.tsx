import { useMemo } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  FileChurnScatter,
  FileConstellation,
  FileTreemap,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { capabilityCoverageNote, CoverageNote } from '../../../../widgets/bodies/shared.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, fileBasename } from '../format.js';
import styles from '../CodebaseDetailView.module.css';

export function LandscapePanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const files = analytics.file_heatmap;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const hooksNote = capabilityCoverageNote(tools, 'hooks');

  const workTypeTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of files) {
      const k = f.work_type || 'other';
      m.set(k, (m.get(k) ?? 0) + f.touch_count);
    }
    return m;
  }, [files]);

  const completionBuckets = useMemo(() => {
    let high = 0;
    let mid = 0;
    let low = 0;
    let withOutcome = 0;
    for (const f of files) {
      if (f.outcome_rate == null || f.outcome_rate <= 0) continue;
      withOutcome++;
      if (f.outcome_rate >= 70) high++;
      else if (f.outcome_rate >= 40) mid++;
      else low++;
    }
    return { high, mid, low, withOutcome };
  }, [files]);

  const churnEntries = useMemo(
    () =>
      files
        .filter((f) => (f.total_lines_added ?? 0) + (f.total_lines_removed ?? 0) > 0)
        .map((f) => ({
          file: f.file,
          lines_added: f.total_lines_added ?? 0,
          lines_removed: f.total_lines_removed ?? 0,
          work_type: f.work_type,
          touch_count: f.touch_count,
        })),
    [files],
  );

  const churnTop = useMemo(() => {
    if (churnEntries.length === 0) return null;
    return [...churnEntries].sort(
      (a, b) => b.lines_added + b.lines_removed - (a.lines_added + a.lines_removed),
    )[0];
  }, [churnEntries]);

  if (files.length === 0) {
    return (
      <div className={styles.panel}>
        <CoverageNote text={hooksNote} />
        <span className={styles.empty}>
          No file edits captured yet. The treemap fills as agents touch files this period.
        </span>
      </div>
    );
  }

  // Q1 landscape: leading work-type share for prose
  const totalTouches = files.reduce((s, f) => s + f.touch_count, 0);
  const sortedWT = [...workTypeTotals.entries()].sort((a, b) => b[1] - a[1]);
  const topWt = sortedWT[0];
  const topPct = topWt && totalTouches > 0 ? Math.round((topWt[1] / totalTouches) * 100) : 0;
  const dirsLen = analytics.directory_heatmap.length;

  const landscapeAnswer =
    topWt && topPct >= 30 ? (
      <>
        <Metric>{fmtCount(analytics.files_touched_total)}</Metric> files touched across{' '}
        <Metric>{fmtCount(dirsLen)}</Metric> directories. <Metric>{topWt[0]}</Metric> dominates at{' '}
        <Metric>{topPct}%</Metric> of touches.
      </>
    ) : (
      <>
        <Metric>{fmtCount(analytics.files_touched_total)}</Metric> files touched, mixed work types.
      </>
    );

  // Q2 completion-by-file: threshold counts using the same outcome_rate
  // cutoffs as outcomeRateColor (40/70). Files without a populated
  // outcome_rate are excluded from the count.
  const completionAnswer =
    completionBuckets.withOutcome === 0 ? null : (
      <>
        <Metric tone="positive">{completionBuckets.high}</Metric> files completed at 70%+,{' '}
        <Metric tone="warning">{completionBuckets.mid}</Metric> in the 40-69% middle band,{' '}
        <Metric tone="negative">{completionBuckets.low}</Metric> below 40%, a thrash signal.
      </>
    );

  // Q3 churn-shape: lead with the top churner
  const churnAnswer = churnTop ? (
    <>
      <Metric>{fileBasename(churnTop.file)}</Metric> moved{' '}
      <Metric tone="positive">+{fmtCount(churnTop.lines_added)}</Metric> /{' '}
      <Metric tone="negative">−{fmtCount(churnTop.lines_removed)}</Metric> lines across{' '}
      <Metric>{fmtCount(churnTop.touch_count ?? 0)}</Metric> touches.
    </>
  ) : null;

  const questions: FocusedQuestion[] = [
    {
      id: 'landscape',
      question: 'Where are the agents working?',
      answer: landscapeAnswer,
      children: (
        <FileTreemap entries={files} totalFiles={analytics.files_touched_total} height={360} />
      ),
      relatedLinks: getCrossLinks('codebase', 'landscape', 'landscape'),
    },
  ];

  if (completionAnswer) {
    questions.push({
      id: 'completion-by-file',
      question: 'Which files actually finish what they start?',
      answer: completionAnswer,
      children: <FileConstellation entries={files} />,
    });
  } else {
    questions.push({
      id: 'completion-by-file',
      question: 'Which files actually finish what they start?',
      answer: (
        <>
          Completion rate appears once sessions touching files record outcomes. Most populate within
          the first 24h.
        </>
      ),
      children: (
        <span className={styles.empty}>
          Completion rate appears once sessions touching files record outcomes. Most populate within
          the first 24h.
        </span>
      ),
    });
  }

  if (churnAnswer && churnEntries.length > 0) {
    questions.push({
      id: 'churn-shape',
      question: 'How much code is moving through the hot files?',
      answer: churnAnswer,
      children: <FileChurnScatter entries={churnEntries} />,
    });
  } else {
    questions.push({
      id: 'churn-shape',
      question: 'How much code is moving through the hot files?',
      answer: (
        <>Lines-changed data populates from hooks. Active on Claude Code, Cursor, Windsurf today.</>
      ),
      children: (
        <span className={styles.empty}>
          Lines-changed data populates from hooks. Active on Claude Code, Cursor, Windsurf today.
        </span>
      ),
    });
  }

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
