import { type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { BreakdownList, BreakdownMeta } from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { completionColor } from '../../../../widgets/utils.js';
import { CoverageNote, capabilityCoverageNote } from '../../../../widgets/bodies/shared.js';
import { MIN_TOOL_SAMPLE } from '../../../../widgets/bodies/ToolWidgets.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, formatMinutes } from '../format.js';
import styles from '../OutcomesDetailView.module.css';

export function RetriesPanel({ analytics }: { analytics: UserAnalytics }) {
  const oneShot = analytics.tool_call_stats;
  const sc = analytics.scope_complexity.filter((b) => b.sessions > 0);
  const retriesActiveId = useQueryParam('q');
  const toolsReporting = analytics.data_coverage?.tools_reporting ?? [];

  if (oneShot.one_shot_sessions === 0 && sc.length < 2) {
    return (
      <span className={styles.empty}>
        One-shot success needs tool call logs (Claude Code today). Scope complexity needs at least
        two populated buckets.
      </span>
    );
  }

  const oneShotAnswer = (
    <>
      <Metric tone="positive">{oneShot.one_shot_rate}%</Metric> of{' '}
      <Metric>{fmtCount(oneShot.one_shot_sessions)}</Metric> sessions with tool call data landed
      their edits without a retry cycle.
    </>
  );

  const questions: FocusedQuestion[] = [];
  if (oneShot.one_shot_sessions > 0) {
    questions.push({
      id: 'one-shot',
      question: 'How often do edits work on the first try?',
      answer: oneShotAnswer,
      children: <OneShotBlock oneShot={oneShot} toolsReporting={toolsReporting} />,
      relatedLinks: getCrossLinks('outcomes', 'retries', 'one-shot'),
    });
  }
  if (sc.length >= 2) {
    questions.push({
      id: 'scope',
      question: 'Does scope hurt completion?',
      answer: completionTrendSentence(sc),
      children: <ScopeLadder sc={sc} />,
    });
  }

  return (
    <FocusedDetailView
      questions={questions}
      activeId={retriesActiveId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}

function OneShotBlock({
  oneShot,
  toolsReporting,
}: {
  oneShot: UserAnalytics['tool_call_stats'];
  toolsReporting: NonNullable<UserAnalytics['data_coverage']>['tools_reporting'];
}) {
  const hostRows = [...(oneShot.host_one_shot ?? [])]
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
  const maxSessions = Math.max(...hostRows.map((r) => r.sessions), 1);
  const note = capabilityCoverageNote(toolsReporting, 'toolCallLogs');

  return (
    <>
      <div className={styles.stuckRow}>
        <span className={styles.stuckHero}>
          <span className={styles.stuckValue}>{oneShot.one_shot_rate}</span>
          <span className={styles.stuckUnit}>%</span>
        </span>
        <div className={styles.stuckFacts}>
          <span className={styles.stuckFact}>
            <span className={styles.stuckFactValue}>{fmtCount(oneShot.one_shot_sessions)}</span>{' '}
            sessions with tool call data
          </span>
          <span className={styles.stuckFact}>
            {fmtCount(oneShot.total_calls)} tool calls · {oneShot.error_rate}% errored
          </span>
          <span className={styles.stuckFact}>
            Detected via Edit -&gt; Bash -&gt; Edit retry patterns in Claude Code JSONL
          </span>
        </div>
      </div>
      {hostRows.length >= 2 ? (
        <BreakdownList
          items={hostRows.map((r) => {
            const meta = getToolMeta(r.host_tool);
            const enough = r.sessions >= MIN_TOOL_SAMPLE;
            return {
              key: r.host_tool,
              label: meta.label,
              fillPct: enough ? r.one_shot_rate : (r.sessions / maxSessions) * 100,
              fillColor: meta.color,
              value: (
                <>
                  {enough ? `${r.one_shot_rate}% first try` : '--'}
                  <BreakdownMeta>
                    {' · '}
                    {fmtCount(r.sessions)} sessions
                  </BreakdownMeta>
                </>
              ),
            };
          })}
        />
      ) : (
        <span className={styles.empty}>
          Only one tool currently reports tool-call logs, so no per-tool comparison yet.
        </span>
      )}
      <CoverageNote text={note} />
    </>
  );
}

function ScopeLadder({ sc }: { sc: UserAnalytics['scope_complexity'] }) {
  return (
    <div className={styles.scopeLadder}>
      {sc.map((b, i) => {
        const color = completionColor(b.completion_rate);
        return (
          <div
            key={b.bucket}
            className={styles.scopeLadderRow}
            style={{ '--row-index': i, '--scope-rate': `${b.completion_rate}%` } as CSSProperties}
          >
            <span className={styles.scopeLadderBucket}>{b.bucket}</span>
            <span className={styles.scopeLadderTrack}>
              <span className={styles.scopeLadderFill} style={{ background: color }} />
            </span>
            <span className={styles.scopeLadderRate} style={{ color }}>
              {b.completion_rate}%
            </span>
            <span className={styles.scopeLadderFacts}>
              <span>
                <span className={styles.scopeLadderFactValue}>{fmtCount(b.sessions)}</span> sessions
              </span>
              <span>
                <span className={styles.scopeLadderFactValue}>
                  {formatMinutes(b.avg_duration_min)}m
                </span>{' '}
                average
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function completionTrendSentence(sc: UserAnalytics['scope_complexity']): string {
  const first = sc[0];
  const last = sc[sc.length - 1];
  const diff = last.completion_rate - first.completion_rate;
  if (Math.abs(diff) < 5) {
    return `Completion holds roughly flat across scope: ${first.completion_rate}% at ${first.bucket}, ${last.completion_rate}% at ${last.bucket}.`;
  }
  if (diff < 0) {
    return `Completion drops from ${first.completion_rate}% at ${first.bucket} to ${last.completion_rate}% at ${last.bucket}. Larger scope sessions fail more.`;
  }
  return `Completion rises from ${first.completion_rate}% at ${first.bucket} to ${last.completion_rate}% at ${last.bucket}, wider scope doesn't hurt in this window.`;
}
