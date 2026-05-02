import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { FileFrictionRow, FileList, HeroStatRow } from '../../../../components/viz/index.js';
import type { HeroStatDef } from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import {
  capabilityCoverageNote,
  CoverageNote,
  isSoloTeam,
  Sparkline,
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
  const confusedFiles = analytics.confused_files;
  const fileOverlap = analytics.file_overlap;
  const conflictStats = analytics.conflict_stats;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const hooksNote = capabilityCoverageNote(tools, 'hooks');
  const conversationNote = capabilityCoverageNote(tools, 'conversationLogs');

  const hasOverlapData = fileOverlap.total_files > 0;
  const hasBlockedData = conflictStats.blocked_period > 0 || conflictStats.found_period > 0;

  if (
    fr.length === 0 &&
    ce.length === 0 &&
    confusedFiles.length === 0 &&
    !hasOverlapData &&
    !hasBlockedData
  ) {
    return (
      <div className={styles.panel}>
        <CoverageNote text={hooksNote} />
        <CoverageNote text={conversationNote} />
        <span className={styles.empty}>
          No risk signal yet. Files appear here once sessions touching them end abandoned/failed, or
          once conversation capture shows repeated struggle on the same file.
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

  // Density rate for the overlap-rate question. Counts only, no rate
  // baked in (`fileOverlapStatsSchema` keeps rate consumer-side per its
  // doc-comment): compute here so the answer prose and the hero stat
  // stay aligned. High overlap is not inherently bad (paired work) and
  // low overlap is not inherently good (silos), so neutral tone.
  const overlapRate = hasOverlapData
    ? Math.round((fileOverlap.overlapping_files / fileOverlap.total_files) * 100)
    : 0;

  // Block-rate for the blocked-count question. `found_period` covers
  // every detection (advisory MCP lookups + hook blocks); `blocked_period`
  // is the hook subset that prevented the edit. The rate communicates
  // coordination-layer effectiveness: 100% means every detected conflict
  // was blocked, less means advisory-only paths exist.
  const blockedDaily = (conflictStats.daily_blocked ?? []).map((d) => d.blocked);
  const blockRate =
    conflictStats.found_period > 0
      ? Math.round((conflictStats.blocked_period / conflictStats.found_period) * 100)
      : null;

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

  // Q4 overlap-rate. Density companion to `collisions` (which lists the
  // files): this answers "how much of our file surface sees more than
  // one agent." Drilled into by team-category `file-overlap`. Solo case
  // mirrors the `collisions` empty pattern.
  if (hasOverlapData && !solo) {
    const overlapStats: HeroStatDef[] = [
      {
        key: 'rate',
        value: `${overlapRate}`,
        unit: '%',
        label: 'files with multiple agents',
        sublabel: (
          <>
            <Metric>{fmtCount(fileOverlap.overlapping_files)}</Metric> of{' '}
            <Metric>{fmtCount(fileOverlap.total_files)}</Metric> files
          </>
        ),
      },
    ];
    questions.push({
      id: 'overlap-rate',
      question: 'What share of files do agents share?',
      answer: (
        <>
          <Metric>{overlapRate}%</Metric> of files saw more than one agent this period,{' '}
          <Metric>{fmtCount(fileOverlap.overlapping_files)}</Metric> of{' '}
          <Metric>{fmtCount(fileOverlap.total_files)}</Metric>. High overlap can read as paired work
          or as contention, the file list below tells you which.
        </>
      ),
      children: <HeroStatRow stats={overlapStats} />,
      relatedLinks: getCrossLinks('codebase', 'risk', 'overlap-rate'),
    });
  } else if (solo) {
    questions.push({
      id: 'overlap-rate',
      question: 'What share of files do agents share?',
      answer: <>Requires 2+ agents touching the same file. Solo right now, structurally zero.</>,
      children: (
        <span className={styles.empty}>
          Requires 2+ agents touching the same file. Solo right now, structurally zero.
        </span>
      ),
    });
  } else {
    questions.push({
      id: 'overlap-rate',
      question: 'What share of files do agents share?',
      answer: <>No file activity in this window.</>,
      children: <span className={styles.empty}>No file activity in this window.</span>,
    });
  }

  // Q5 blocked-count. Prevention companion to `collisions` (which lists
  // observed pile-ups): this answers "how often did the coordination
  // layer prevent a collision before it happened." Drilled into by
  // team-category `conflicts-blocked`. Hook-gated: solo or hook-less
  // setups render the honest empty path with the hooks coverage note.
  if (hasBlockedData) {
    const blockedStats: HeroStatDef[] = [
      {
        key: 'blocked',
        value: fmtCount(conflictStats.blocked_period),
        label: 'edits blocked',
        sublabel:
          conflictStats.found_period > conflictStats.blocked_period ? (
            <>
              <Metric>{fmtCount(conflictStats.found_period)}</Metric> total detections
            </>
          ) : null,
      },
    ];
    if (blockRate != null) {
      blockedStats.push({
        key: 'rate',
        value: `${blockRate}`,
        unit: '%',
        label: 'block rate',
        sublabel:
          blockRate < 100 ? (
            <>advisory paths handled the rest</>
          ) : (
            <>every detection prevented the edit</>
          ),
      });
    }
    questions.push({
      id: 'blocked-count',
      question: 'How often did chinmeister prevent collisions?',
      answer: (
        <>
          <Metric tone="positive">{fmtCount(conflictStats.blocked_period)}</Metric> edits blocked
          before two agents collided
          {conflictStats.found_period > conflictStats.blocked_period && (
            <>
              , out of <Metric>{fmtCount(conflictStats.found_period)}</Metric> total detections
            </>
          )}
          .
        </>
      ),
      children: (
        <>
          <HeroStatRow stats={blockedStats} />
          {blockedDaily.length >= 2 && (
            <div className={styles.blockedSpark}>
              <Sparkline values={blockedDaily} color="var(--success)" endDot />
            </div>
          )}
          <CoverageNote text={hooksNote} />
        </>
      ),
      relatedLinks: getCrossLinks('codebase', 'risk', 'blocked-count'),
    });
  } else {
    questions.push({
      id: 'blocked-count',
      question: 'How often did chinmeister prevent collisions?',
      answer: solo ? (
        <>Requires 2+ agents in parallel. Solo right now, no collisions to prevent.</>
      ) : (
        <>No collisions detected this period. Either coordination is clean or hooks are off.</>
      ),
      children: (
        <>
          <span className={styles.empty}>
            {solo
              ? 'Requires 2+ agents in parallel. Solo right now, no collisions to prevent.'
              : 'No collisions detected this period. Either coordination is clean or hooks are off.'}
          </span>
          <CoverageNote text={hooksNote} />
        </>
      ),
    });
  }

  if (confusedFiles.length > 0) {
    const topConfused = confusedFiles[0];
    questions.push({
      id: 'confused-files',
      question: 'Which files are agents struggling to explain?',
      answer: (
        <>
          <Metric>{fileBasename(topConfused.file)}</Metric> had{' '}
          <Metric tone="warning">{fmtCount(topConfused.confused_sessions)}</Metric> confused or
          frustrated sessions
          {topConfused.retried_sessions > 0 && (
            <>
              , including <Metric tone="negative">{fmtCount(topConfused.retried_sessions)}</Metric>{' '}
              that ended abandoned or failed
            </>
          )}
          .
        </>
      ),
      children: (
        <>
          <FileList
            items={confusedFiles.slice(0, 10).map((f) => ({
              key: f.file,
              name: fileBasename(f.file),
              title: f.file,
              meta: (
                <>
                  <span className={styles.fileListStat}>{fmtCount(f.confused_sessions)}</span>{' '}
                  confused sessions
                  {f.retried_sessions > 0 && (
                    <>
                      {' · '}
                      <span className={styles.fileListStat}>
                        {fmtCount(f.retried_sessions)}
                      </span>{' '}
                      abandoned or failed
                    </>
                  )}
                </>
              ),
            }))}
          />
          <CoverageNote text={conversationNote} />
        </>
      ),
    });
  } else {
    questions.push({
      id: 'confused-files',
      question: 'Which files are agents struggling to explain?',
      answer: <>No files crossed the repeated-struggle threshold in this window.</>,
      children: (
        <>
          <span className={styles.empty}>
            Files appear here after 2+ confused or frustrated sessions touch the same path.
          </span>
          <CoverageNote text={conversationNote} />
        </>
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
