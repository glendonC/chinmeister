import { useState } from 'react';

import {
  FocusedDetailView,
  Metric,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { DirectoryConstellation, FileConstellation } from '../../../../components/viz/index.js';
import { WorkTypeStrip } from '../../../../components/WorkTypeStrip/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../UsageDetailView.module.css';

// NVR (new vs revisited) two-segment bar. Scoped to this panel; the viz is
// specific to the files-touched story (was this week's breadth expansion or
// familiar ground?) and doesn't generalise enough to earn a slot in the
// shared viz primitives. Ink carries "new"; revisited drops to a muted ink
// tint so the expansion slice reads as the answer.
function NewVsRevisitedBar({ newFiles, revisited }: { newFiles: number; revisited: number }) {
  const total = newFiles + revisited;
  if (total <= 0) return null;
  const newShare = Math.round((newFiles / total) * 100);
  return (
    <div className={styles.nvr}>
      <div
        className={styles.nvrBar}
        role="img"
        aria-label={`${newFiles} new, ${revisited} revisited`}
      >
        {newFiles > 0 && <div className={styles.nvrSegNew} style={{ flex: newFiles }} />}
        {revisited > 0 && <div className={styles.nvrSegRevisited} style={{ flex: revisited }} />}
      </div>
      <ul className={styles.nvrLegend}>
        <li className={styles.nvrLegendItem}>
          <span className={styles.nvrLegendCount}>{fmtCount(newFiles)}</span>
          <span className={styles.nvrLegendLabel}>new</span>
          <span className={styles.nvrLegendShare}>{newShare}%</span>
        </li>
        <li className={styles.nvrLegendItem}>
          <span className={styles.nvrLegendCount}>{fmtCount(revisited)}</span>
          <span className={styles.nvrLegendLabel}>revisited</span>
          <span className={styles.nvrLegendShare}>{100 - newShare}%</span>
        </li>
      </ul>
    </div>
  );
}

export function FilesTouchedPanel({ analytics }: { analytics: UserAnalytics }) {
  const files = analytics.file_heatmap;
  const dirs = analytics.directory_heatmap;
  const filesTotal = analytics.files_touched_total;
  const workTypeBreakdown = analytics.files_by_work_type;
  const nvr = analytics.files_new_vs_revisited;
  const nvrTotal = nvr.new_files + nvr.revisited_files;

  // Hero work-type strip doubles as a filter for the File Constellation —
  // clicking a segment dims every dot whose work_type doesn't match. Clicking
  // the active segment clears. Scoped to the panel so navigation to other
  // tabs resets the filter without extra state plumbing.
  const [activeWorkType, setActiveWorkType] = useState<string | null>(null);
  const filesActiveId = useQueryParam('q');

  if (filesTotal === 0 && files.length === 0) {
    return <span className={styles.empty}>No files touched in this window.</span>;
  }

  // Tones: new-file share can read as positive expansion when it's the
  // larger slice, otherwise neutral. File/directory counts stay neutral —
  // "lots of files touched" isn't inherently good or bad without context.
  const breadthAnswer = (() => {
    if (filesTotal === 0) return null;
    const topWT =
      workTypeBreakdown.length > 0
        ? [...workTypeBreakdown].sort((a, b) => b.file_count - a.file_count)[0]
        : null;
    if (topWT) {
      return (
        <>
          <Metric>{fmtCount(filesTotal)}</Metric> distinct files touched.{' '}
          <Metric>{topWT.work_type}</Metric> carries the biggest share at{' '}
          <Metric>{fmtCount(topWT.file_count)}</Metric>.
        </>
      );
    }
    return (
      <>
        <Metric>{fmtCount(filesTotal)}</Metric> distinct files touched.
      </>
    );
  })();

  const nvrAnswer = (() => {
    if (nvrTotal === 0) return null;
    const newShare = Math.round((nvr.new_files / nvrTotal) * 100);
    const tone = newShare >= 60 ? 'positive' : newShare <= 30 ? 'neutral' : 'neutral';
    return (
      <>
        <Metric tone={tone}>{newShare}%</Metric> new, <Metric>{100 - newShare}%</Metric> revisited
        across <Metric>{fmtCount(nvrTotal)}</Metric> files.
      </>
    );
  })();

  const constellationAnswer = (() => {
    if (files.length === 0) return null;
    const top = [...files].sort((a, b) => b.touch_count - a.touch_count)[0];
    const completion = top.outcome_rate != null ? Math.round(top.outcome_rate) : null;
    const fileName = top.file.split('/').pop() ?? top.file;
    if (completion != null) {
      const tone = completion >= 70 ? 'positive' : completion >= 40 ? 'warning' : 'negative';
      return (
        <>
          <Metric>{fileName}</Metric> leads at <Metric>{fmtCount(top.touch_count)} touches</Metric>{' '}
          and <Metric tone={tone}>{completion}%</Metric> completion.
        </>
      );
    }
    return (
      <>
        <Metric>{fileName}</Metric> is the hottest at{' '}
        <Metric>{fmtCount(top.touch_count)} touches</Metric>.
      </>
    );
  })();

  const directoriesAnswer = (() => {
    if (dirs.length === 0) return null;
    const top = [...dirs].sort((a, b) => b.touch_count - a.touch_count)[0];
    return (
      <>
        <Metric>{top.directory}</Metric> takes the most work with{' '}
        <Metric>{fmtCount(top.file_count)} files</Metric> and{' '}
        <Metric>{fmtCount(top.touch_count)} touches</Metric>.
      </>
    );
  })();

  const questions: FocusedQuestion[] = [];
  if (breadthAnswer) {
    questions.push({
      id: 'breadth',
      question: 'How much surface is being touched?',
      answer: breadthAnswer,
      children: (
        <div className={styles.filesHero}>
          <span className={styles.filesHeroValue}>{fmtCount(filesTotal)}</span>
          {workTypeBreakdown.length > 0 && (
            <WorkTypeStrip
              entries={workTypeBreakdown}
              variant="hero"
              ariaLabel={`${filesTotal} distinct files by work type`}
              activeWorkType={activeWorkType}
              onSelect={setActiveWorkType}
            />
          )}
        </div>
      ),
    });
  }
  if (nvrTotal > 0 && nvrAnswer) {
    questions.push({
      id: 'new-vs-revisited',
      question: 'Expanding or returning?',
      answer: nvrAnswer,
      children: <NewVsRevisitedBar newFiles={nvr.new_files} revisited={nvr.revisited_files} />,
    });
  }
  if (files.length > 0 && constellationAnswer) {
    questions.push({
      id: 'constellation',
      question: 'Which files are hot?',
      answer: constellationAnswer,
      children: (
        <FileConstellation
          entries={files}
          activeWorkType={activeWorkType}
          ariaLabel={`${files.length} files plotted by touches × completion rate`}
        />
      ),
    });
  }
  if (dirs.length > 0 && directoriesAnswer) {
    questions.push({
      id: 'directories',
      question: 'Which directories take the most work?',
      answer: directoriesAnswer,
      children: (
        <DirectoryConstellation
          entries={dirs}
          ariaLabel={`${dirs.length} directories plotted by breadth × depth`}
        />
      ),
    });
  }

  if (questions.length === 0) {
    return <span className={styles.empty}>No files touched in this window.</span>;
  }

  return (
    <FocusedDetailView
      questions={questions}
      activeId={filesActiveId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}
