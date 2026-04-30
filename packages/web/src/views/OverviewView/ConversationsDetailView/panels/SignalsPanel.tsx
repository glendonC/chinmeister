import { type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import ToolIcon from '../../../../components/ToolIcon/ToolIcon.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';
import {
  capabilityCoverageNote,
  CoverageNote,
  FilePath,
} from '../../../../widgets/bodies/shared.js';
import shared from '../../../../widgets/widget-shared.module.css';

import { fmtCount } from '../../UsageDetailView/format.js';
import styles from '../ConversationsDetailView.module.css';

export function SignalsPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'conversationLogs');
  const confusedFiles = analytics.confused_files;
  const handoffs = analytics.cross_tool_handoff_questions;
  const unanswered = analytics.unanswered_questions;

  const questions: FocusedQuestion[] = [
    {
      id: 'confused-files',
      question: 'Which files made agents struggle?',
      answer:
        confusedFiles.length > 0 ? (
          <>
            <Metric>{lastPathSegment(confusedFiles[0].file)}</Metric> leads with{' '}
            <Metric tone="warning">{fmtCount(confusedFiles[0].confused_sessions)}</Metric> confused
            or frustrated sessions.
          </>
        ) : (
          <>No file crossed the repeated-struggle threshold in this window.</>
        ),
      children: (
        <>
          {confusedFiles.length > 0 ? (
            <div className={shared.dataList}>
              {confusedFiles.slice(0, 10).map((f, i) => (
                <div
                  key={f.file}
                  className={shared.dataRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <FilePath path={f.file} order="name-first" />
                  <div className={shared.dataMeta}>
                    <span className={shared.dataStat}>
                      {fmtCount(f.confused_sessions)} confused
                    </span>
                    <span className={shared.dataStat}>
                      {fmtCount(f.retried_sessions)} abandoned or failed
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className={styles.empty}>
              Files appear here after 2+ confused or frustrated sessions touch the same path.
            </span>
          )}
          <CoverageNote text={note} />
        </>
      ),
    },
    {
      id: 'question-handoffs',
      question: 'Which abandoned questions crossed tools?',
      answer:
        handoffs.length > 0 ? (
          <>
            <Metric>
              {getToolMeta(handoffs[0].tool_from).label} to {getToolMeta(handoffs[0].tool_to).label}
            </Metric>{' '}
            picked up <Metric>{lastPathSegment(handoffs[0].file)}</Metric> after{' '}
            <Metric>{formatGap(handoffs[0].gap_minutes)}</Metric>.
          </>
        ) : (
          <>No abandoned-question handoffs crossed tools in this window.</>
        ),
      children: (
        <>
          {handoffs.length > 0 ? (
            <div className={shared.dataList}>
              {handoffs.slice(0, 12).map((h, i) => {
                const from = getToolMeta(h.tool_from);
                const to = getToolMeta(h.tool_to);
                return (
                  <div
                    key={`${h.handoff_at}-${h.file}-${h.tool_from}-${h.tool_to}`}
                    className={shared.dataRow}
                    style={{ '--row-index': i } as CSSProperties}
                  >
                    <span className={styles.route}>
                      <span className={styles.routeTool}>
                        <ToolIcon tool={h.tool_from} size={14} />
                        <span>{from.label}</span>
                      </span>
                      <span className={styles.routeArrow}>to</span>
                      <span className={styles.routeTool}>
                        <ToolIcon tool={h.tool_to} size={14} />
                        <span>{to.label}</span>
                      </span>
                    </span>
                    <FilePath path={h.file} order="name-first" />
                    <div className={shared.dataMeta}>
                      <span className={shared.dataStat}>{formatGap(h.gap_minutes)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <span className={styles.empty}>
              Handoffs appear when another tool picks up the same file after an abandoned question.
            </span>
          )}
          <CoverageNote text={note} />
        </>
      ),
    },
    {
      id: 'unanswered-questions',
      question: 'Which questions were left behind?',
      answer:
        unanswered.count > 0 ? (
          <>
            <Metric tone="warning">{fmtCount(unanswered.count)}</Metric> user questions were inside
            sessions that ended abandoned.
          </>
        ) : (
          <>No abandoned sessions contained user questions in this window.</>
        ),
      children: (
        <>
          {unanswered.recent.length > 0 ? (
            <div className={shared.dataList}>
              {unanswered.recent.map((entry, i) => {
                const meta = entry.host_tool ? getToolMeta(entry.host_tool) : null;
                return (
                  <div
                    key={entry.event_id}
                    className={shared.dataRow}
                    style={{ '--row-index': i } as CSSProperties}
                  >
                    <span className={styles.questionPreview}>{entry.question_preview}</span>
                    <div className={shared.dataMeta}>
                      {meta && (
                        <span className={shared.dataStat}>
                          <ToolIcon tool={entry.host_tool ?? ''} size={14} /> {meta.label}
                        </span>
                      )}
                      <span className={shared.dataStat}>{shortDate(entry.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.intentBlock}>
              <span className={styles.intentValue}>{fmtCount(unanswered.count)}</span>
              <span className={styles.intentText}>
                abandoned-question turns that may need a follow-up session or memory update.
              </span>
            </div>
          )}
          <CoverageNote text={note} />
        </>
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

function lastPathSegment(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function formatGap(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

function shortDate(value: string): string {
  if (!value) return '';
  return value.slice(5, 10);
}
