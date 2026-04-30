import { useMemo, type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  DirectoryColumns,
  DirectoryConstellation,
  RateBars,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { capabilityCoverageNote, CoverageNote } from '../../../../widgets/bodies/shared.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../CodebaseDetailView.module.css';

// Severity thresholds for the cold-dirs strip (per spec):
//   14-30d  -> muted
//   30-60d  -> warn
//   60+     -> ghost
function staleSeverityColor(days: number): string {
  if (days >= 60) return 'var(--ghost)';
  if (days >= 30) return 'var(--warn)';
  return 'var(--muted)';
}

export function DirectoriesPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const dirs = analytics.directory_heatmap;
  const stale = analytics.audit_staleness;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const hooksNote = capabilityCoverageNote(tools, 'hooks');

  const enriched = useMemo(
    () =>
      dirs.map((d) => ({
        ...d,
        avg_touches: d.touch_count / Math.max(1, d.file_count),
      })),
    [dirs],
  );
  const widestDeepest = useMemo(
    () =>
      [...enriched].sort((a, b) => b.file_count * b.avg_touches - a.file_count * a.avg_touches)[0],
    [enriched],
  );
  const focusedDir = useMemo(
    () =>
      [...enriched]
        .filter((d) => d.file_count <= 3 && d.avg_touches >= 2)
        .sort((a, b) => b.avg_touches - a.avg_touches)[0] ?? null,
    [enriched],
  );

  if (dirs.length === 0 && stale.length === 0) {
    return (
      <div className={styles.panel}>
        <CoverageNote text={hooksNote} />
        <span className={styles.empty}>
          Directory rollup needs at least one captured edit. Hooks are populating today on Claude
          Code, Cursor, and Windsurf.
        </span>
      </div>
    );
  }

  // Q1 top-dirs
  const topDir = dirs[0];
  const topDirsAnswer = topDir ? (
    <>
      <Metric>{topDir.directory}</Metric> leads with <Metric>{fmtCount(topDir.touch_count)}</Metric>{' '}
      touches across <Metric>{fmtCount(topDir.file_count)}</Metric> files. Completion sits at{' '}
      <Metric
        tone={
          topDir.completion_rate >= 70
            ? 'positive'
            : topDir.completion_rate >= 40
              ? 'warning'
              : 'negative'
        }
      >
        {topDir.completion_rate}%
      </Metric>
      .
    </>
  ) : null;

  // Q2 breadth-vs-depth
  const breadthAnswer = widestDeepest ? (
    <>
      <Metric>{widestDeepest.directory}</Metric> is wide-and-deep,{' '}
      <Metric>{fmtCount(widestDeepest.file_count)}</Metric> files,{' '}
      <Metric>{widestDeepest.avg_touches.toFixed(1)}</Metric> touches each.
      {focusedDir && focusedDir.directory !== widestDeepest.directory && (
        <>
          {' '}
          <Metric>{focusedDir.directory}</Metric> is rework-focused: few files, repeated touches.
        </>
      )}
    </>
  ) : null;

  // Q3 cold-dirs
  const coldAnswer =
    stale.length > 0 ? (
      <>
        <Metric>{fmtCount(stale.length)}</Metric> directories have prior activity but no edits in
        14+ days. Open these to confirm ownership or prune dead code.
      </>
    ) : null;

  const questions: FocusedQuestion[] = [];
  if (topDirsAnswer && dirs.length > 0) {
    questions.push({
      id: 'top-dirs',
      question: 'Where does the work concentrate?',
      answer: topDirsAnswer,
      children: (
        <RateBars
          rows={dirs.map((d) => ({
            key: d.directory,
            label: d.directory,
            rate: d.completion_rate,
            value: fmtCount(d.touch_count),
            sublabel: `${d.completion_rate}% completed`,
          }))}
          tone="completion"
          labelWidth={200}
        />
      ),
    });
    questions.push({
      id: 'files-in-dirs',
      question: 'Which files inside busy directories?',
      answer: <>File-level distribution within the busy directories, grouped by work type.</>,
      children: (
        <DirectoryColumns
          files={analytics.file_heatmap.map((f) => ({
            file: f.file,
            touch_count: f.touch_count,
            work_type: f.work_type,
          }))}
          height={240}
        />
      ),
    });
  } else {
    questions.push({
      id: 'top-dirs',
      question: 'Where does the work concentrate?',
      answer: <>Activity rolls up by directory once files are touched.</>,
      children: (
        <span className={styles.empty}>Activity rolls up by directory once files are touched.</span>
      ),
    });
    questions.push({
      id: 'files-in-dirs',
      question: 'Which files inside busy directories?',
      answer: <>File-level distribution appears once directories have touches.</>,
      children: (
        <span className={styles.empty}>
          File-level distribution appears once directories have touches.
        </span>
      ),
    });
  }

  if (breadthAnswer && dirs.length > 0) {
    questions.push({
      id: 'breadth-vs-depth',
      question: 'Are we sprawling or focused?',
      answer: breadthAnswer,
      children: <DirectoryConstellation entries={dirs} />,
    });
  } else {
    questions.push({
      id: 'breadth-vs-depth',
      question: 'Are we sprawling or focused?',
      answer: <>Directory constellation needs at least one touched directory.</>,
      children: (
        <span className={styles.empty}>
          Directory constellation needs at least one touched directory.
        </span>
      ),
    });
  }

  if (coldAnswer) {
    questions.push({
      id: 'cold-dirs',
      question: 'Which directories has nobody touched in two weeks?',
      answer: coldAnswer,
      children: (
        <div className={styles.dataList}>
          {stale.slice(0, 12).map((d, i) => {
            const color = staleSeverityColor(d.days_since);
            return (
              <div
                key={d.directory}
                className={styles.dataRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.dataName} title={d.directory}>
                  {d.directory}
                </span>
                <span
                  className={styles.daysStrip}
                  style={
                    {
                      '--strip-fill': `${Math.min(100, Math.round((d.days_since / 90) * 100))}%`,
                      '--strip-color': color,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
                <span className={styles.dataMeta}>
                  <span className={styles.dataStatValue} style={{ color }}>
                    {d.days_since}d
                  </span>{' '}
                  · {fmtCount(d.prior_edit_count)} prior
                </span>
              </div>
            );
          })}
        </div>
      ),
    });
  } else {
    questions.push({
      id: 'cold-dirs',
      question: 'Which directories has nobody touched in two weeks?',
      answer: (
        <>
          No cold directories, everything with prior activity has been touched in the last 14 days.
        </>
      ),
      children: (
        <span className={styles.empty}>
          No cold directories, everything with prior activity has been touched in the last 14 days.
        </span>
      ),
    });
  }

  return (
    <div className={styles.panel}>
      <CoverageNote text={hooksNote} />
      <FocusedDetailView
        questions={questions}
        activeId={activeId}
        onSelect={(id) => setQueryParam('q', id)}
      />
    </div>
  );
}
