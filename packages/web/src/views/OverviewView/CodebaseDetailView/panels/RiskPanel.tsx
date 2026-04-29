import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { FileFrictionRow, FileList } from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import {
  capabilityCoverageNote,
  CoverageNote,
  isSoloTeam,
} from '../../../../widgets/bodies/shared.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, fileBasename } from '../format.js';
import styles from '../CodebaseDetailView.module.css';

// Failing-file row severity: >=50% rework rate is the high-signal red line,
// matches widget body's reworkSeverityColor mapping for the same field.
function reworkSeverityColor(ratio: number): string {
  return ratio >= 50 ? 'var(--danger)' : 'var(--warn)';
}

export function RiskPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const fr = analytics.file_rework;
  const ce = analytics.concurrent_edits;
  const fh = analytics.file_heatmap;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const hooksNote = capabilityCoverageNote(tools, 'hooks');

  if (fr.length === 0 && ce.length === 0) {
    return (
      <div className={styles.panel}>
        <CoverageNote text={hooksNote} />
        <span className={styles.empty}>
          No risk signal yet. Files appear here once sessions touching them end abandoned/failed, or
          once 14+-day cold directories accumulate.
        </span>
      </div>
    );
  }

  // High-churn x failing intersection. The Q1 question above ranks files
  // by failure rate alone, which surfaces files that fail often regardless
  // of how heavily they're worked. Q3 narrows to files that are both hot
  // and unstable, a file failing 60% of the time across 30 edits is a
  // different risk than the same rate across 4 edits. Joins on file path;
  // gracefully drops file_rework entries with no matching heatmap row
  // since the spec doesn't guarantee both lists carry every file.
  const heatmapByFile = new Map(fh.map((f) => [f.file, f.touch_count]));
  const churnFloor = (() => {
    if (fh.length === 0) return 0;
    const sorted = [...fh.map((f) => f.touch_count)].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  })();
  const intersection = fr
    .map((f) => ({
      file: f.file,
      rework_ratio: f.rework_ratio,
      total_edits: f.total_edits,
      failed_edits: f.failed_edits,
      touch_count: heatmapByFile.get(f.file) ?? 0,
    }))
    .filter((f) => f.touch_count >= churnFloor && f.touch_count > 0)
    .sort((a, b) => b.touch_count * b.rework_ratio - a.touch_count * a.rework_ratio)
    .slice(0, 5);

  // Q1 failing-files: FileFrictionRow per spec; the FileConstellation join
  // described in the spec collapses to messy data when file_rework entries
  // don't always land in file_heatmap. The friction-row primitive is the
  // spec-endorsed fallback shape.
  const failingTop = fr[0];
  const failingAnswer = failingTop ? (
    <>
      <Metric>{fileBasename(failingTop.file)}</Metric> sits in failing sessions{' '}
      <Metric tone="negative">{failingTop.rework_ratio}%</Metric> of the time across{' '}
      <Metric>{fmtCount(failingTop.total_edits)}</Metric> edits.
    </>
  ) : null;

  // Q2 collisions
  const collisionTop = ce[0];
  const solo = isSoloTeam(analytics);
  const collisionAnswer =
    collisionTop && !solo ? (
      <>
        <Metric>{fileBasename(collisionTop.file)}</Metric> was touched by{' '}
        <Metric>{collisionTop.agents}</Metric> agents across{' '}
        <Metric>{fmtCount(collisionTop.edit_count)}</Metric> edits.
      </>
    ) : null;

  const questions: FocusedQuestion[] = [];
  if (failingAnswer && fr.length > 0) {
    questions.push({
      id: 'failing-files',
      question: 'Which files keep showing up in failing sessions?',
      answer: failingAnswer,
      children: (
        <div className={styles.frictionList}>
          {fr.slice(0, 10).map((f, i) => (
            <FileFrictionRow
              key={f.file}
              index={i}
              label={fileBasename(f.file)}
              title={f.file}
              barFill={f.rework_ratio / 100}
              barColor={reworkSeverityColor(f.rework_ratio)}
              meta={
                <>
                  {f.rework_ratio}% in failing sessions · {fmtCount(f.failed_edits)}/
                  {fmtCount(f.total_edits)} edits
                </>
              }
            />
          ))}
        </div>
      ),
      relatedLinks: getCrossLinks('codebase', 'risk', 'failing-files'),
    });
  } else {
    questions.push({
      id: 'failing-files',
      question: 'Which files keep showing up in failing sessions?',
      answer: <>No failing-session files in this window.</>,
      children: <span className={styles.empty}>No failing-session files in this window.</span>,
    });
  }

  // Q2 hot-and-failing. Read this with the failing-files list above, not
  // in place of it: this narrows to files that carry both kinds of risk
  // so a brief review window can prioritize the ones with the highest
  // payoff.
  if (intersection.length > 0) {
    const topIntersection = intersection[0];
    const topName = fileBasename(topIntersection.file);
    questions.push({
      id: 'hot-and-failing',
      question: 'Which heavily worked files are also unstable?',
      answer: (
        <>
          <Metric>{topName}</Metric> sees{' '}
          <Metric>{fmtCount(topIntersection.touch_count)} touches</Metric> and fails{' '}
          <Metric tone="negative">{topIntersection.rework_ratio}%</Metric> of the time.
        </>
      ),
      children: (
        <div className={styles.frictionList}>
          {intersection.map((f, i) => (
            <FileFrictionRow
              key={f.file}
              index={i}
              label={fileBasename(f.file)}
              title={f.file}
              barFill={f.rework_ratio / 100}
              barColor={reworkSeverityColor(f.rework_ratio)}
              meta={
                <>
                  {fmtCount(f.touch_count)} touches · {f.rework_ratio}% in failing sessions
                </>
              }
            />
          ))}
        </div>
      ),
    });
  }

  if (collisionAnswer && ce.length > 0) {
    questions.push({
      id: 'collisions',
      question: 'Where are agents stepping on each other?',
      answer: collisionAnswer,
      children: (
        <FileList
          items={ce.slice(0, 10).map((f) => ({
            key: f.file,
            name: fileBasename(f.file),
            title: f.file,
            meta: (
              <>
                <span className={styles.fileListStat}>{f.agents}</span> agents ·{' '}
                <span className={styles.fileListStat}>{fmtCount(f.edit_count)}</span> edits
              </>
            ),
          }))}
        />
      ),
      relatedLinks: getCrossLinks('codebase', 'risk', 'collisions'),
    });
  } else if (solo) {
    questions.push({
      id: 'collisions',
      question: 'Where are agents stepping on each other?',
      answer: <>Requires 2+ agents touching the same file. Solo right now, structurally zero.</>,
      children: (
        <span className={styles.empty}>
          Requires 2+ agents touching the same file. Solo right now, structurally zero.
        </span>
      ),
    });
  } else {
    questions.push({
      id: 'collisions',
      question: 'Where are agents stepping on each other?',
      answer: <>No multi-agent edits in this window, the team is touching disjoint files.</>,
      children: (
        <span className={styles.empty}>
          No multi-agent edits in this window, the team is touching disjoint files.
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
