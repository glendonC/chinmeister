import { type CSSProperties } from 'react';
import clsx from 'clsx';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import { navigateToDetail } from '../../lib/router.js';
import styles from './ConversationWidgets.module.css';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import {
  capabilityCoverageNote,
  CoverageNote,
  FilePath,
  MoreHidden,
  StatWidget,
} from './shared.js';

// Conversations category. Three widgets, all using sentiment/topic as
// INPUTS to coordination questions (never headline) per ANALYTICS_SPEC §10.
//
// Visual vocabulary matches the live category: subgrid table + named
// header + body rows. Substrate-unique viz lives inside cells (per-session
// outcome stripe for files; tool-icon route for handoffs) so the widgets
// earn distinct identity without forking the table primitive.
//
// Drill targets fold conversation-derived signals into their owning axes:
// file struggle lives in Codebase risk, tool-switch questions in Tools flow,
// and abandoned intent in Outcomes sessions.

const CONFUSED_FILES_VISIBLE = 8;
const CROSS_TOOL_HANDOFFS_VISIBLE = 8;

// ── confused-files (6×3) ────────────────────────────
//
// Files where the user-side conversation expressed confusion or
// frustration in 2+ sessions. Surfaces the file (coordination axis),
// not the sentiment polarity. Sessions cell is a two-segment stacked
// bar normalized to the max session count across visible rows: width
// reads as magnitude, the leading --danger segment reads as the
// abandoned share, the trailing --warn segment reads as the
// confused-but-recovered share. Same `fillTrack` / `fillBar` primitive
// the codebase tables use, so the conversation table speaks the same
// visual vocabulary as file-rework and audit-staleness.
function ConfusedFilesWidget({ analytics }: WidgetBodyProps) {
  const cf = analytics.confused_files;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'conversationLogs');
  if (cf.length === 0) {
    return (
      <>
        <SectionEmpty>
          Files where the agent struggled appear after 2+ sessions show confused or frustrated
          messages.
        </SectionEmpty>
        <CoverageNote text={note} />
      </>
    );
  }
  const visible = cf.slice(0, CONFUSED_FILES_VISIBLE);
  const hidden = cf.length - visible.length;
  const maxSessions = Math.max(...visible.map((f) => f.confused_sessions), 1);
  const open = () => navigateToDetail('conversations', 'signals', 'confused-files');
  return (
    <>
      <div className={clsx(styles.convoTable, styles.confusedTable)}>
        <div className={styles.convoHeader}>
          <span>File</span>
          <span>Sessions</span>
          <span className={styles.convoHeaderNum}>Total</span>
          <span aria-hidden="true" />
        </div>
        <div className={styles.convoBody}>
          {visible.map((f, i) => {
            const baseName = f.file.split('/').filter(Boolean).pop() ?? f.file;
            return (
              <button
                key={f.file}
                type="button"
                className={styles.convoRow}
                style={{ '--row-index': i } as CSSProperties}
                onClick={open}
                aria-label={`Open conversation signals · ${baseName}: ${f.confused_sessions} confused sessions, ${f.retried_sessions} abandoned`}
              >
                <FilePath path={f.file} />
                <ConfusedSessionsBar
                  total={f.confused_sessions}
                  abandoned={f.retried_sessions}
                  max={maxSessions}
                />
                <span className={styles.confusedTotal}>{f.confused_sessions}</span>
                <span className={styles.convoViewButton}>View</span>
              </button>
            );
          })}
        </div>
      </div>
      <MoreHidden count={hidden} />
    </>
  );
}

// Two-segment stacked bar normalized to the max session count across
// visible rows. The danger segment renders first so the abandoned
// share reads from the left edge of the bar; trailing warn segment
// covers the confused-but-recovered share. Air to the right of the
// fill represents the gap between this row and the worst row in the
// visible set — magnitude scales without a cap.
function ConfusedSessionsBar({
  total,
  abandoned,
  max,
}: {
  total: number;
  abandoned: number;
  max: number;
}) {
  const totalPct = (total / max) * 100;
  const abandonedPct = (Math.min(abandoned, total) / max) * 100;
  const confusedPct = Math.max(0, totalPct - abandonedPct);
  return (
    <span className={styles.confusedSessionsCell} aria-hidden="true">
      {abandonedPct > 0 && (
        <span className={styles.confusedSegmentAbandoned} style={{ width: `${abandonedPct}%` }} />
      )}
      {confusedPct > 0 && (
        <span className={styles.confusedSegmentConfused} style={{ width: `${confusedPct}%` }} />
      )}
    </span>
  );
}

// ── cross-tool-handoff-questions (6×3) ──────────────
//
// Substrate-unique events: one tool abandoned mid-question, another
// tool picked up the same file with another question or confused turn
// within 24h. Route cell renders both tool icons with their labels
// flanking a directional arrow — visually it reads as a flow, which
// is the substrate signal no single-tool surface can show.
function CrossToolHandoffsWidget({ analytics }: WidgetBodyProps) {
  const events = analytics.cross_tool_handoff_questions;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'conversationLogs');
  if (events.length === 0) {
    return (
      <>
        <SectionEmpty>
          Handoffs appear when one tool ends a session abandoned mid-question and a different tool
          picks up the same file within 24 hours.
        </SectionEmpty>
        <CoverageNote text={note} />
      </>
    );
  }
  const visible = events.slice(0, CROSS_TOOL_HANDOFFS_VISIBLE);
  const hidden = events.length - visible.length;
  const open = () => navigateToDetail('conversations', 'signals', 'question-handoffs');
  return (
    <>
      <div className={clsx(styles.convoTable, styles.handoffTable)}>
        <div className={styles.convoHeader}>
          <span>Route</span>
          <span className={styles.convoHeaderNum}>Gap</span>
          <span>File</span>
          <span aria-hidden="true" />
        </div>
        <div className={styles.convoBody}>
          {visible.map((e, i) => {
            const baseName = e.file.split('/').filter(Boolean).pop() ?? e.file;
            const fromLabel = getToolMeta(e.tool_from).label;
            const toLabel = getToolMeta(e.tool_to).label;
            return (
              <button
                key={`${e.handoff_at}-${e.file}-${e.tool_from}-${e.tool_to}`}
                type="button"
                className={styles.convoRow}
                style={{ '--row-index': i } as CSSProperties}
                onClick={open}
                aria-label={`Open conversation signals · ${fromLabel} to ${toLabel} on ${baseName}, ${formatGap(e.gap_minutes)} gap`}
              >
                <span className={styles.routeCell}>
                  <span className={styles.routeTool}>
                    <ToolIcon tool={e.tool_from} size={14} />
                    <span>{fromLabel}</span>
                  </span>
                  <span className={styles.routeArrow} aria-hidden="true">
                    →
                  </span>
                  <span className={styles.routeTool}>
                    <ToolIcon tool={e.tool_to} size={14} />
                    <span>{toLabel}</span>
                  </span>
                </span>
                <span className={styles.gapCell}>{formatGap(e.gap_minutes)}</span>
                <FilePath path={e.file} />
                <span className={styles.convoViewButton}>View</span>
              </button>
            );
          })}
        </div>
      </div>
      <MoreHidden count={hidden} />
    </>
  );
}

// ── unanswered-questions (4×2) ──────────────────────
//
// Bare hero stat. The widget title carries the metric name; the body
// is just the number. Same primitive as Stuckness, OneShotRate, Sessions.
function UnansweredQuestionsWidget({ analytics }: WidgetBodyProps) {
  const uq = analytics.unanswered_questions;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'conversationLogs');
  // When count=0 with partial conversation-log coverage, render `--` instead
  // of `0` so the user can tell "system measured zero" apart from "the only
  // tool that would have measured this isn't reporting." Full coverage with
  // count=0 falls through to the genuine `0`.
  if (uq.count === 0 && note) {
    return (
      <>
        <StatWidget value="--" />
        <CoverageNote text={note} />
      </>
    );
  }
  const value = uq.count.toLocaleString();
  return (
    <StatWidget
      value={value}
      onOpenDetail={() => navigateToDetail('conversations', 'signals', 'unanswered-questions')}
      detailAriaLabel={`Open conversation signals · ${value} unanswered questions`}
    />
  );
}

// ── helpers ─────────────────────────────────────────

// Compact gap formatter. Window is capped at 24h server-side so the
// day branch is defensive only.
function formatGap(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export const conversationWidgets: WidgetRegistry = {
  'confused-files': ConfusedFilesWidget,
  'cross-tool-handoff-questions': CrossToolHandoffsWidget,
  'unanswered-questions': UnansweredQuestionsWidget,
};
