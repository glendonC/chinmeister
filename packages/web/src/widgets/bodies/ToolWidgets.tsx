/**
 * Tools & Models widget category.
 *
 * Five widgets:
 *   tool-handoffs        — cross-tool handoff strip (default, 6×3)
 *   tool-work-type-fit   — where each tool wins by work-type (default, 6×4)
 *   tool-call-errors     — error rate hero + top patterns (default, 6×3)
 *   one-shot-by-tool     — per-tool first-try rate (catalog, 6×3)
 *   model-mix            — total spend leads, share strip with click-to-inspect (catalog, 4×3)
 *
 * Substrate-unique angles owned by this category:
 *   - Cross-tool file flow (tool-handoffs)
 *   - Head-to-head completion on identical work-types (tool-work-type-fit)
 *   - Per-vendor first-try rate on the same repo (one-shot-by-tool)
 *
 * Design language: chromeless. No cards, no dividers; hierarchy comes from
 * font weight, opacity, and color. Mono for labels and metadata. Em-dash
 * for unmeasured, 0 for measured zero. Stagger via --row-index × 35ms.
 * Accent is reserved for live data; static counts use --ink. Coverage
 * notes for any metric gated on a deep-capture capability. No decoration
 * dots or chrome outlines: color carries through the rate, not through
 * brand bullets adjacent to labels.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import SectionOverflow from '../../components/SectionOverflow/SectionOverflow.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.js';
import { aggregateModels, completionColor, formatCost } from '../utils.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import { setQueryParams } from '../../lib/router.js';
import type { UserAnalytics } from '../../lib/apiSchemas.js';
import styles from './ToolWidgets.module.css';
import { AnnotatedStrip, type AnnotatedStripSegment } from './atoms/AnnotatedStrip.js';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import {
  GhostRows,
  CoverageNote,
  capabilityCoverageNote,
  StatWidget,
  visibleRowsWithOverflow,
} from './shared.js';

function openTools(tab: string, q: string) {
  return () => setQueryParams({ tools: tab, q });
}

function visibleRowsForTable(
  total: number,
  noOverflowCap: number,
  withOverflowCap: number,
): number {
  return visibleRowsWithOverflow(total, noOverflowCap, withOverflowCap);
}

function TableOverflow({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <div className={styles.tableOverflow}>
      <SectionOverflow count={count} label="tools" onClick={onClick} />
    </div>
  );
}

// ── Shared constants ───────────────────────────────

/**
 * Minimum sample size before per-tool ratios render as numbers. Below this
 * threshold, the cell renders an em-dash so a single-session quirk doesn't
 * masquerade as a measured rate. Tunable in one place; do not duplicate.
 */
export const MIN_TOOL_SAMPLE = 3;

// ── 1) tool-handoffs (Cross-Tool Flow, 6×3 default) ──────────────────

interface FlowLink {
  from: string;
  to: string;
  file_count: number;
  completion_rate: number;
}

/**
 * Main-view flow strip. The overview answers one question quickly:
 * "How much work crossed tool boundaries, and did it generally land?"
 * Pair counts, rates, and timing belong in the Tools detail view.
 *
 * The strip is interactive: each segment is a button. At rest the head
 * caption names the leading pair so colors are interpretable on first
 * read; clicking a segment swaps the caption to that pair's detail. Same
 * pattern as model-mix.
 */
function ToolHandoffsWidget({ analytics }: WidgetBodyProps) {
  const handoffs = analytics.tool_handoffs;
  const tools = analytics.tool_comparison;
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (handoffs.length === 0) {
    const toolCount = tools.length;
    const message =
      toolCount <= 1
        ? 'Connect a second tool with `chinmeister add <tool>` to see how files travel between agents.'
        : 'Your agents stayed inside one tool each this period.';
    return <SectionEmpty>{message}</SectionEmpty>;
  }

  const sortedLinks: FlowLink[] = [...handoffs]
    .sort((a, b) => b.file_count - a.file_count)
    .map((h) => ({
      from: h.from_tool,
      to: h.to_tool,
      file_count: h.file_count,
      completion_rate: h.handoff_completion_rate,
    }));

  const maxBands = 5;
  const displayLinks =
    sortedLinks.length <= maxBands
      ? sortedLinks
      : [
          ...sortedLinks.slice(0, maxBands - 1),
          {
            from: 'other',
            to: 'other',
            file_count: sortedLinks.slice(maxBands - 1).reduce((s, h) => s + h.file_count, 0),
            completion_rate: Math.round(
              sortedLinks
                .slice(maxBands - 1)
                .reduce((s, h) => s + h.completion_rate * h.file_count, 0) /
                Math.max(
                  1,
                  sortedLinks.slice(maxBands - 1).reduce((s, h) => s + h.file_count, 0),
                ),
            ),
          },
        ];
  const totalFiles = handoffs.reduce((s, h) => s + h.file_count, 0);
  const weightedComplete = handoffs.reduce(
    (s, h) => s + (h.handoff_completion_rate * h.file_count) / 100,
    0,
  );
  const avgComplete = totalFiles > 0 ? Math.round((weightedComplete / totalFiles) * 100) : 0;
  const aria = sortedLinks
    .map((h) => {
      const from = getToolMeta(h.from).label;
      const to = getToolMeta(h.to).label;
      return `${from} to ${to}: ${h.file_count} files`;
    })
    .join(', ');

  const focusKey = (link: FlowLink) => `${link.from}->${link.to}`;
  const tailCount = sortedLinks.length - (maxBands - 1);
  const segments: AnnotatedStripSegment[] = displayLinks.map((link) => {
    if (link.from === 'other') {
      return {
        key: focusKey(link),
        value: link.file_count,
        color: 'var(--soft)',
        label: `+${tailCount} more`,
      };
    }
    const fromMeta = getToolMeta(link.from);
    const toMeta = getToolMeta(link.to);
    return {
      key: focusKey(link),
      value: link.file_count,
      color: fromMeta.color,
      label: `${fromMeta.label} → ${toMeta.label}`,
    };
  });
  const annotatedKey = activeKey ?? (displayLinks[0] ? focusKey(displayLinks[0]) : null);

  return (
    <div
      className={styles.handoffWeft}
      role="group"
      aria-label={`${totalFiles} files handed off across tools. ${avgComplete} percent completed after handoff. Flow mix: ${aria}`}
    >
      <div className={styles.handoffLead}>
        <span className={styles.handoffLeadValue}>{totalFiles.toLocaleString()}</span>
        <span className={styles.handoffLeadLabel}>
          {totalFiles === 1 ? 'file handed off' : 'files handed off'}
        </span>
      </div>
      <AnnotatedStrip
        segments={segments}
        annotatedKey={annotatedKey}
        activeKey={activeKey}
        onSegmentClick={(key) => setActiveKey(activeKey === key ? null : key)}
        ariaLabel="Cross-tool handoff flow"
        titleFor={(s) => `${s.label}: ${s.value} ${s.value === 1 ? 'file' : 'files'}`}
      />
    </div>
  );
}

// ── 2) tool-work-type-fit (Where Each Tool Wins, 6×4 default) ────────

interface FitRow {
  host_tool: string;
  best_work_type: string | null;
  best_rate: number;
  best_sessions: number;
  total_sessions: number;
}

/**
 * Per-tool routing summary. One row per tool with its strongest work-type,
 * the completion rate on that work-type, sample size, and total sessions.
 * Structurally identical to `directories` (col tracks: identity / count /
 * bar+rate) so a user who learned one read learns the other for free.
 *
 * "Best" is the work-type with the highest completion rate among cells with
 * sample ≥ MIN_TOOL_SAMPLE. Tools with no qualifying cell render em-dashes
 * for best/rate; total_sessions still reports honestly.
 */
function ToolWorkTypeFitWidget({ analytics }: WidgetBodyProps) {
  const breakdown = analytics.tool_work_type;
  const tools = analytics.tool_comparison;

  if (breakdown.length === 0 || tools.length === 0) {
    return (
      <SectionEmpty>Run a few sessions across your tools to see where each one wins.</SectionEmpty>
    );
  }

  const byTool = new Map<string, FitRow>();
  for (const t of tools) {
    byTool.set(t.host_tool, {
      host_tool: t.host_tool,
      best_work_type: null,
      best_rate: 0,
      best_sessions: 0,
      total_sessions: t.sessions,
    });
  }
  for (const b of breakdown) {
    if (b.sessions < MIN_TOOL_SAMPLE) continue;
    const row = byTool.get(b.host_tool);
    if (!row) continue;
    if (b.completion_rate > row.best_rate) {
      row.best_work_type = b.work_type;
      row.best_rate = b.completion_rate;
      row.best_sessions = b.sessions;
    }
  }

  const allRows = [...byTool.values()].sort((a, b) => b.total_sessions - a.total_sessions);
  const rows = allRows.slice(0, visibleRowsForTable(allRows.length, 6, 5));
  const hidden = allRows.length - rows.length;
  const open = openTools('tools', 'work-type');

  return (
    <div className={styles.fitTable} role="table">
      <div className={styles.fitHeadRow} role="row">
        <span role="columnheader">tool</span>
        <span role="columnheader">best at</span>
        <span role="columnheader" className={styles.fitHeadNum}>
          sessions
        </span>
        <span role="columnheader">completion</span>
        <span aria-hidden="true" />
      </div>
      {rows.map((r, i) => {
        const meta = getToolMeta(r.host_tool);
        const hasBest = r.best_work_type != null;
        const rate = Math.round(r.best_rate);
        const rateColor = hasBest ? completionColor(r.best_rate) : 'var(--soft)';
        const content = (
          <>
            <span className={styles.fitToolName}>
              <ToolIcon tool={r.host_tool} size={16} />
              <span className={styles.fitToolLabel}>{meta.label}</span>
            </span>
            <span className={styles.fitWorkType}>
              {hasBest ? r.best_work_type : <span className={styles.fitWorkTypeEmpty}>—</span>}
            </span>
            <span className={styles.fitSessions}>{r.total_sessions.toLocaleString()}</span>
            <span className={styles.fitCompletion}>
              <span className={styles.fitCompletionTrack}>
                {hasBest && (
                  <span
                    className={styles.fitCompletionFill}
                    style={{
                      width: `${Math.max(2, rate)}%`,
                      background: rateColor,
                      opacity: 'var(--opacity-bar-fill)',
                    }}
                  />
                )}
              </span>
              <span className={styles.fitCompletionValue} style={{ color: rateColor }}>
                {hasBest ? `${rate}%` : '—'}
              </span>
            </span>
            <span className={styles.viewButton}>View</span>
          </>
        );
        return (
          <button
            key={r.host_tool}
            type="button"
            role="row"
            className={styles.fitDataRow}
            style={{ '--row-index': i } as CSSProperties}
            onClick={open}
            aria-label={`Open tools detail · ${meta.label} strongest at ${r.best_work_type ?? 'no work-type yet'}`}
          >
            {content}
          </button>
        );
      })}
      <TableOverflow count={hidden} onClick={open} />
    </div>
  );
}

// ── 3) one-shot-by-tool (Per-Tool First-Try, 6×3 catalog) ─────────────

/**
 * Per-tool one-shot rate sliced by host_tool. Same metric the cockpit
 * one-shot-rate KPI shows, broken out per vendor. Substrate-unique because
 * no other dashboard sees competitor first-try rates on the same repo.
 * Tools below MIN_TOOL_SAMPLE render em-dash with the session count exposed
 * for honesty.
 *
 * Structure mirrors directories: TOOL | SESSIONS | RATE bar.
 */
function OneShotByToolWidget({ analytics }: WidgetBodyProps) {
  const rows = analytics.tool_call_stats.host_one_shot ?? [];
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'toolCallLogs');

  if (rows.length === 0) {
    return (
      <>
        <GhostRows count={3} />
        <CoverageNote text={note} />
      </>
    );
  }

  const visible = rows.slice(0, visibleRowsForTable(rows.length, 4, 3));
  const hidden = rows.length - visible.length;
  const open = openTools('tools', 'one-shot');

  return (
    <>
      <div className={styles.oneShotWrap}>
        <div className={styles.oneShotTable} role="table">
          <div className={styles.oneShotHeadRow} role="row">
            <span role="columnheader">tool</span>
            <span role="columnheader" className={styles.oneShotHeadNum}>
              sessions
            </span>
            <span role="columnheader">first-try rate</span>
            <span aria-hidden="true" />
          </div>
          {visible.map((r, i) => {
            const meta = getToolMeta(r.host_tool);
            const enough = r.sessions >= MIN_TOOL_SAMPLE;
            const rate = r.one_shot_rate;
            const rateColor = enough ? completionColor(rate) : 'var(--soft)';
            const content = (
              <>
                <span className={styles.oneShotName}>
                  <ToolIcon tool={r.host_tool} size={16} />
                  <span className={styles.oneShotLabel}>{meta.label}</span>
                </span>
                <span className={styles.oneShotSessions}>{r.sessions.toLocaleString()}</span>
                <span className={styles.oneShotCompletion}>
                  <span className={styles.oneShotTrack}>
                    {enough && (
                      <span
                        className={styles.oneShotFill}
                        style={{
                          width: `${Math.max(2, rate)}%`,
                          background: rateColor,
                          opacity: 'var(--opacity-bar-fill)',
                        }}
                      />
                    )}
                  </span>
                  <span className={styles.oneShotValue} style={{ color: rateColor }}>
                    {enough ? `${rate}%` : '—'}
                  </span>
                </span>
                <span className={styles.viewButton}>View</span>
              </>
            );
            return (
              <button
                key={r.host_tool}
                type="button"
                role="row"
                className={styles.oneShotRow}
                style={{ '--row-index': i } as CSSProperties}
                onClick={open}
                aria-label={`Open tools detail · ${meta.label} first-try rate ${enough ? `${rate}%` : 'not enough sessions'}`}
              >
                {content}
              </button>
            );
          })}
          <TableOverflow count={hidden} onClick={open} />
        </div>
      </div>
    </>
  );
}

// ── 4) tool-call-errors (Error-Rate Stat Card, 4×2 default) ──────────

/**
 * Single-stat KPI card matching the cockpit pattern (one-shot-rate, edits,
 * cost). Renders the period error_rate as the hero number; clicking the
 * value drills into the errors detail view where the top patterns,
 * frequent / recent split, and per-tool fingerprints live.
 */
function ToolCallErrorsWidget({ analytics }: WidgetBodyProps) {
  const stats = analytics.tool_call_stats;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'toolCallLogs');

  if (stats.total_calls === 0) {
    return (
      <>
        <StatWidget value="--" />
        <CoverageNote text={note} />
      </>
    );
  }

  const value = `${stats.error_rate}%`;
  return (
    <StatWidget
      value={value}
      onOpenDetail={openTools('errors', 'top')}
      detailAriaLabel={`Open errors detail · ${value} error rate`}
    />
  );
}

// ── 5) model-mix (Cost Hero + Share Strip, 4×3 catalog) ──────────────

const MIX_TOP_N = 7;

/**
 * Total spend leads (or model count when cost is unavailable). Stacked
 * share strip below splits sessions by model; clicking a segment makes
 * that model active and reveals its sessions / tokens / cost. At 8+
 * models, the tail collapses into a single "+N more" segment to keep
 * the strip legible. Avoids the model A > B ranking anti-pattern
 * (§10 #5) — share is a fact, not a recommendation.
 */
function ModelMixWidget({ analytics }: WidgetBodyProps) {
  const models = useMemo(
    () => aggregateModels(analytics.model_outcomes),
    [analytics.model_outcomes],
  );
  const tu = analytics.token_usage;
  const tokensByModel = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number | null }>();
    for (const m of tu.by_model) {
      map.set(m.agent_model, {
        tokens: m.input_tokens + m.output_tokens,
        cost: m.estimated_cost_usd,
      });
    }
    return map;
  }, [tu.by_model]);

  const [active, setActive] = useState<string | null>(null);

  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'tokenUsage');

  if (models.length === 0) {
    return (
      <>
        <GhostRows count={2} />
        <CoverageNote text={note} />
      </>
    );
  }

  const totalCost = tu.total_estimated_cost_usd;
  const hasCost = totalCost != null && totalCost > 0;

  // Segments: top-N visible, rest collapsed into a single tail segment.
  const sortedModels = [...models].sort((a, b) => b.total - a.total);
  const visible = sortedModels.slice(0, MIX_TOP_N);
  const tail = sortedModels.slice(MIX_TOP_N);
  const tailTotal = tail.reduce((s, m) => s + m.total, 0);

  const activeModel = active ? models.find((x) => x.model === active) : null;
  const activeTokens = active ? tokensByModel.get(active) : null;

  const heroValue = activeModel
    ? hasCost && activeTokens?.cost != null && activeTokens.cost > 0
      ? formatCost(activeTokens.cost, 2)
      : activeModel.total.toLocaleString()
    : hasCost
      ? formatCost(totalCost, 2)
      : String(models.length);

  const TAIL_KEY = '__tail__';
  const segments: AnnotatedStripSegment[] = [
    ...visible.map((m) => ({
      key: m.model,
      value: m.total,
      color: hashModelColor(m.model),
      label: m.model,
    })),
    ...(tail.length > 0
      ? [
          {
            key: TAIL_KEY,
            value: tailTotal,
            color: 'var(--soft)',
            label: `+${tail.length} more`,
          },
        ]
      : []),
  ];
  const annotatedKey = active ?? segments[0]?.key ?? null;

  return (
    <div className={styles.mixWrap}>
      <div className={styles.mixHead}>
        <span className={styles.mixHeadValueLead}>{heroValue}</span>
        {activeModel && (
          <span className={styles.mixHeadCaption}>
            <span className={styles.mixHeadName}>{activeModel.model}</span>
            <span className={styles.mixHeadSep}>·</span>
            <span className={styles.mixHeadValue}>{activeModel.total.toLocaleString()}</span>{' '}
            {activeModel.total === 1 ? 'session' : 'sessions'}
            {activeTokens && activeTokens.tokens > 0 && (
              <>
                <span className={styles.mixHeadSep}>·</span>
                <span className={styles.mixHeadValue}>
                  {formatTokenCount(activeTokens.tokens)}
                </span>{' '}
                tokens
              </>
            )}
          </span>
        )}
      </div>
      <AnnotatedStrip
        segments={segments}
        annotatedKey={annotatedKey}
        activeKey={active}
        onSegmentClick={(key) => {
          if (key === TAIL_KEY) return;
          setActive(active === key ? null : key);
        }}
        ariaLabel="Model session share"
        stripHeight={14}
        titleFor={(s) =>
          s.key === TAIL_KEY
            ? tail.map((m) => `${m.model} · ${m.total}`).join(', ')
            : `${s.label} · ${s.value} ${s.value === 1 ? 'session' : 'sessions'}`
        }
      />
    </div>
  );
}

/**
 * Deterministic color per model name. Hash to a saturated-but-muted HSL so
 * the share strip stays distinguishable across models without colliding
 * with the work-type or tool-brand palettes.
 */
function hashModelColor(model: string): string {
  let h = 5381;
  for (let i = 0; i < model.length; i++) h = ((h << 5) + h + model.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 35%, 58%)`;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

// Re-exports `UserAnalytics` shape for IDE jump-to-definition convenience.
export type { UserAnalytics };

export const toolWidgets: WidgetRegistry = {
  'tool-handoffs': ToolHandoffsWidget,
  'tool-work-type-fit': ToolWorkTypeFitWidget,
  'one-shot-by-tool': OneShotByToolWidget,
  'tool-call-errors': ToolCallErrorsWidget,
  'model-mix': ModelMixWidget,
};
