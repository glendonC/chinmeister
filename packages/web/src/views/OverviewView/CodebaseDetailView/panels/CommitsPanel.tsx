import { useMemo, type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  BreakdownList,
  BreakdownMeta,
  HeroStatRow,
  InteractiveDailyChurn,
  type HeroStatDef,
  type InteractiveDailyChurnEntry,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { capabilityCoverageNote, CoverageNote } from '../../../../widgets/bodies/shared.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../CodebaseDetailView.module.css';

export function CommitsPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const cs = analytics.commit_stats;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const commitsNote = capabilityCoverageNote(tools, 'commitTracking');

  const peak = useMemo(() => {
    if (cs.daily_commits.length === 0) return null;
    return [...cs.daily_commits].sort((a, b) => b.commits - a.commits)[0];
  }, [cs.daily_commits]);

  if (cs.total_commits === 0) {
    return (
      <div className={styles.panel}>
        <CoverageNote text={commitsNote} />
        <span className={styles.empty}>
          Commits require hook tracking. Live on Claude Code, Cursor, and Windsurf today.
        </span>
      </div>
    );
  }

  // Q1 commits-headline: HeroStatRow mirrors the on-cockpit widget
  const headlineStats: HeroStatDef[] = [
    {
      key: 'total',
      value: fmtCount(cs.total_commits),
      label: 'commits',
    },
    {
      key: 'per-session',
      value: cs.commits_per_session.toFixed(2),
      label: 'per session',
    },
    {
      key: 'sessions',
      value: fmtCount(cs.sessions_with_commits),
      label: 'sessions with commits',
    },
  ];
  if (cs.avg_time_to_first_commit_min != null) {
    headlineStats.push({
      key: 'first',
      value: cs.avg_time_to_first_commit_min.toFixed(1),
      unit: ' min',
      label: 'median to first commit',
    });
  }

  const headlineAnswer = (
    <>
      <Metric>{fmtCount(cs.total_commits)}</Metric> commits across{' '}
      <Metric>{fmtCount(cs.sessions_with_commits)}</Metric> sessions, averaging{' '}
      <Metric>{cs.commits_per_session.toFixed(2)}</Metric> per session.
      {cs.avg_time_to_first_commit_min != null && (
        <>
          {' '}
          Median time to first commit:{' '}
          <Metric>{cs.avg_time_to_first_commit_min.toFixed(1)} min</Metric>.
        </>
      )}
    </>
  );

  // Q2 commits-by-tool
  const byTool = [...cs.by_tool].sort((a, b) => b.commits - a.commits);
  const topToolBreakdown = byTool[0];
  const totalToolCommits = byTool.reduce((s, t) => s + t.commits, 0);
  const byToolAnswer = topToolBreakdown ? (
    <>
      <Metric>{getToolMeta(topToolBreakdown.host_tool).label}</Metric> drove{' '}
      <Metric>{fmtCount(topToolBreakdown.commits)}</Metric> commits, averaging{' '}
      <Metric>{topToolBreakdown.avg_files_changed.toFixed(1)}</Metric> files and{' '}
      <Metric>{fmtCount(Math.round(topToolBreakdown.avg_lines))}</Metric> lines per commit.
    </>
  ) : null;

  // Q3 daily-commits
  const dailyEntries: InteractiveDailyChurnEntry[] = [
    {
      key: 'commits',
      label: 'Commits',
      series: cs.daily_commits.map((d) => ({
        day: d.day,
        added: d.commits,
        removed: 0,
      })),
    },
  ];
  const lows = cs.daily_commits.filter((d) => d.commits === 0).length;
  const dailyAnswer = peak ? (
    <>
      Commits peaked at <Metric>{fmtCount(peak.commits)}</Metric> on <Metric>{peak.day}</Metric>;
      flat at <Metric>{fmtCount(lows)}</Metric> active days with no commits.
    </>
  ) : null;

  // Q4 commits-vs-completion
  const oc = cs.outcome_correlation;
  const withCommits = oc.find((b) => /with/i.test(b.bucket) && !/no|without/i.test(b.bucket));
  const noCommits = oc.find((b) => /no|without/i.test(b.bucket));
  const onlyOne = oc.length === 1;
  const correlationAnswer =
    withCommits && noCommits ? (
      <>
        Sessions with commits complete at{' '}
        <Metric tone="positive">{withCommits.completion_rate}%</Metric>, vs{' '}
        <Metric tone="warning">{noCommits.completion_rate}%</Metric> for sessions with none.
      </>
    ) : onlyOne && oc[0] ? (
      <>
        <Metric>{oc[0].completion_rate}%</Metric> completion across{' '}
        <Metric>{fmtCount(oc[0].sessions)}</Metric> {oc[0].bucket} sessions in this window.
      </>
    ) : null;

  const questions: FocusedQuestion[] = [
    {
      id: 'commits-headline',
      question: 'How much landed as actual commits?',
      answer: headlineAnswer,
      children: <HeroStatRow stats={headlineStats} />,
      relatedLinks: getCrossLinks('codebase', 'commits', 'commits-headline'),
    },
  ];

  if (byToolAnswer && byTool.length > 0) {
    const maxCommits = Math.max(...byTool.map((t) => t.commits), 1);
    questions.push({
      id: 'commits-by-tool',
      question: 'Which tools are committing?',
      answer: byToolAnswer,
      children: (
        <BreakdownList
          items={byTool.map((t) => {
            const meta = getToolMeta(t.host_tool);
            const share = totalToolCommits > 0 ? (t.commits / totalToolCommits) * 100 : 0;
            return {
              key: t.host_tool,
              label: meta.label,
              fillPct: (t.commits / maxCommits) * 100,
              fillColor: meta.color,
              value: (
                <>
                  {fmtCount(t.commits)} commits
                  <BreakdownMeta>
                    {' · '}
                    {Math.round(share)}% · {t.avg_files_changed.toFixed(1)} files ·{' '}
                    {fmtCount(Math.round(t.avg_lines))} lines/commit
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
      id: 'commits-by-tool',
      question: 'Which tools are committing?',
      answer: <>Per-tool commit data populates as tools with commit hooks run sessions.</>,
      children: (
        <span className={styles.empty}>
          Per-tool commit data populates as tools with commit hooks run sessions.
        </span>
      ),
    });
  }

  if (dailyAnswer && cs.daily_commits.length > 0) {
    questions.push({
      id: 'daily-commits',
      question: 'When did commits land?',
      answer: dailyAnswer,
      children: <InteractiveDailyChurn entries={dailyEntries} unitLabel="commits" />,
    });
  } else {
    questions.push({
      id: 'daily-commits',
      question: 'When did commits land?',
      answer: <>Commits day-by-day populates with commit-tracking tools running sessions.</>,
      children: (
        <span className={styles.empty}>
          Commits day-by-day populates with commit-tracking tools running sessions.
        </span>
      ),
    });
  }

  // Q4: skip when fewer than 2 buckets per spec edge guard.
  if (oc.length >= 2 && correlationAnswer) {
    questions.push({
      id: 'commits-vs-completion',
      question: 'Do committing sessions actually finish?',
      answer: correlationAnswer,
      children: (
        <CompletionBucketBars
          buckets={oc.map((b) => ({
            label: b.bucket,
            rate: b.completion_rate,
            sessions: b.sessions,
          }))}
        />
      ),
    });
  } else if (onlyOne && correlationAnswer && oc[0]) {
    const only = oc[0];
    questions.push({
      id: 'commits-vs-completion',
      question: 'Do committing sessions actually finish?',
      answer: correlationAnswer,
      children: (
        <CompletionBucketBars
          buckets={[
            {
              label: only.bucket,
              rate: only.completion_rate,
              sessions: only.sessions,
            },
          ]}
          footer={`No comparison, all sessions in this window ${
            /no|without/i.test(only.bucket) ? 'did not commit' : 'committed'
          }.`}
        />
      ),
    });
  }

  return (
    <div className={styles.panel}>
      <CoverageNote text={commitsNote} />
      <FocusedDetailView
        questions={questions}
        activeId={activeId}
        onSelect={(id) => setQueryParam('q', id)}
      />
    </div>
  );
}

// Inline viz: completion bucket bars. Two-row horizontal bars for the
// commits-vs-completion question. Reuses the wtBarTrack/wtBarFill semantics
// from OutcomesDetailView's WorkTypesPanel, same chrome, scoped here so
// codebase doesn't reach into outcomes' private CSS module.

interface BucketBar {
  label: string;
  rate: number;
  sessions: number;
}

function CompletionBucketBars({ buckets, footer }: { buckets: BucketBar[]; footer?: string }) {
  const maxRate = Math.max(...buckets.map((b) => b.rate), 1);
  return (
    <div className={styles.bucketList}>
      {buckets.map((b, i) => (
        <div
          key={b.label}
          className={styles.bucketRow}
          style={{ '--row-index': i } as CSSProperties}
        >
          <span className={styles.bucketLabel}>{b.label}</span>
          <div className={styles.bucketTrack}>
            <div
              className={styles.bucketFill}
              style={{
                width: `${(b.rate / maxRate) * 100}%`,
                background:
                  b.rate >= 70 ? 'var(--success)' : b.rate >= 40 ? 'var(--warn)' : 'var(--danger)',
              }}
            />
          </div>
          <span className={styles.bucketValue}>
            {b.rate}%<span className={styles.bucketValueSoft}>{fmtCount(b.sessions)} sessions</span>
          </span>
        </div>
      ))}
      {footer && <p className={styles.bucketFooter}>{footer}</p>}
    </div>
  );
}
