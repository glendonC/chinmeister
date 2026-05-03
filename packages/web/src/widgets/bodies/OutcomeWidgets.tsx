import { useMemo, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import { navigateToDetail, setQueryParam } from '../../lib/router.js';
import { completionColor } from '../utils.js';
import type { UserAnalytics } from '../../lib/apiSchemas.js';
import styles from './OutcomeWidgets.module.css';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import { AnnotatedRing, type AnnotatedRingArc } from './atoms/AnnotatedRing.js';
import { CoverageNote, Sparkline, StatWidget } from './shared.js';

function openOutcomes(tab: string) {
  return () => setQueryParam('outcomes', tab);
}

/* ─────────────────────────────────────────────────────
 * Outcomes category — main-view widgets.
 *
 * The category answers one question: "did the work land?" Every widget
 * here visualizes that from a different angle with a distinct viz family.
 * The catalog (widgets/catalog/outcomes.ts) owns the size + viz contract
 * per id; this file owns the bodies. The trend variant (`outcome-trend`)
 * lives in TrendWidgets.tsx.
 *
 *   outcomes         — ring + clickable row table
 *   one-shot-rate    — KPI stat
 *   stuckness        — KPI stat
 *   scope-complexity — scope-bucket terrace
 *
 * Coverage notes only render in empty states. Populated states keep the
 * widget body chromeless: the widget title names the metric; repeating it
 * below the value is filler. ──────────────────────── */

// ── Outcomes ring + clickable row table ─────────────
//
// 8×3 cell = ~671×240 body. Ring on the left (matches the UsageDetailView
// ToolRing — 160px, SW=8), table on the right with clickable row
// buttons. The ring is the visual identity; the table is the
// breakdown + drill affordance.

type OutcomeKey = 'completed' | 'abandoned' | 'failed' | 'unknown';

interface OutcomeSlice {
  key: OutcomeKey;
  label: string;
  count: number;
  color: string;
  muted: boolean;
}

function OutcomesWidget({ analytics }: WidgetBodyProps) {
  const cs = analytics.completion_summary;
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (cs.total_sessions === 0) {
    return <SectionEmpty>No sessions yet</SectionEmpty>;
  }

  const allSlices: OutcomeSlice[] = [
    {
      key: 'completed',
      label: 'completed',
      count: cs.completed,
      color: 'var(--success)',
      muted: false,
    },
    {
      key: 'abandoned',
      label: 'abandoned',
      count: cs.abandoned,
      color: 'var(--warn)',
      muted: false,
    },
    { key: 'failed', label: 'failed', count: cs.failed, color: 'var(--danger)', muted: false },
    { key: 'unknown', label: 'no outcome', count: cs.unknown, color: 'var(--ghost)', muted: true },
  ];
  const slices = allSlices.filter((s) => s.count > 0);

  // Per-outcome daily series for the TREND mini-sparkline column.
  const trends: Record<OutcomeKey, number[]> = {
    completed: analytics.daily_trends.map((d) => d.completed ?? 0),
    abandoned: analytics.daily_trends.map((d) => d.abandoned ?? 0),
    failed: analytics.daily_trends.map((d) => d.failed ?? 0),
    unknown: analytics.daily_trends.map((d) => {
      const total = d.sessions ?? 0;
      const known = (d.completed ?? 0) + (d.abandoned ?? 0) + (d.failed ?? 0);
      return Math.max(0, total - known);
    }),
  };

  return (
    <div className={styles.outcomeFrame}>
      <OutcomeRing
        slices={slices.filter((s) => !s.muted)}
        cs={cs}
        hoveredKey={hoveredKey}
        onHover={setHoveredKey}
      />
      <div className={styles.outcomeTable} role="table">
        <div className={styles.outcomeHeadRow} role="row">
          <span role="columnheader">outcome</span>
          <span role="columnheader" className={styles.outcomeHeadNum}>
            count
          </span>
          <span role="columnheader">share</span>
          <span role="columnheader">trend</span>
          <span aria-hidden="true" />
        </div>
        {slices.map((s, i) => {
          const share = cs.total_sessions > 0 ? s.count / cs.total_sessions : 0;
          const sharePct = Math.round(share * 100);
          const series = trends[s.key];
          const dimmed = !s.muted && hoveredKey != null && hoveredKey !== s.key;
          return (
            <button
              key={s.key}
              type="button"
              role="row"
              className={clsx(styles.outcomeDataRow, dimmed && styles.outcomeDataRowDim)}
              style={{ '--row-index': i } as CSSProperties}
              onClick={openOutcomes('sessions')}
              onMouseEnter={s.muted ? undefined : () => setHoveredKey(s.key)}
              onMouseLeave={s.muted ? undefined : () => setHoveredKey(null)}
              aria-label={`Open outcomes detail · ${s.label} ${s.count}`}
            >
              <span className={styles.outcomeCellOutcome}>
                <span
                  className={styles.outcomeDot}
                  style={{ background: s.color, opacity: s.muted ? 0.45 : 1 }}
                />
                <span className={styles.outcomeLabel}>{s.label}</span>
              </span>
              <span className={styles.outcomeCount}>{s.count.toLocaleString()}</span>
              <span className={styles.outcomeShareCell}>
                <span className={styles.outcomeShareTrack}>
                  <span
                    className={styles.outcomeShareFill}
                    style={{
                      width: `${Math.max(2, sharePct)}%`,
                      background: s.color,
                      opacity: s.muted ? 0.35 : 'var(--opacity-bar-fill)',
                    }}
                  />
                </span>
                <span className={styles.outcomeShareValue}>{sharePct}%</span>
              </span>
              <span className={styles.outcomeTrendCell}>
                {series.length >= 2 ? (
                  <Sparkline
                    values={series}
                    color={s.color}
                    muted={s.muted}
                    className={styles.outcomeSparkline}
                  />
                ) : (
                  <span className={styles.outcomeTrendBlank}>—</span>
                )}
              </span>
              <span className={styles.outcomeViewButton}>View</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Center text reads completion rate; leader-line labels per slice show the
// share split. labelSide='left' keeps the labels off the table to the right.
// Unknown is pre-filtered out by the caller because it has no audience
// signal in the arc. Hover state is shared with the row table so hovering a
// row dims the other arcs and vice versa.
function OutcomeRing({
  slices,
  cs,
  hoveredKey,
  onHover,
}: {
  slices: OutcomeSlice[];
  cs: UserAnalytics['completion_summary'];
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const arcs = useMemo<AnnotatedRingArc[]>(
    () =>
      slices.map((s) => ({
        key: s.key,
        value: s.count,
        color: s.color,
        label: s.label,
      })),
    [slices],
  );
  const rate = Math.round(cs.completion_rate);
  return (
    <div className={styles.ringBlock}>
      <AnnotatedRing
        arcs={arcs}
        centerValue={`${rate}%`}
        centerEyebrow="COMPLETED"
        labelSide="right"
        ariaLabel={`Completion rate ${rate}%, ${cs.completed} of ${cs.total_sessions} sessions completed`}
        className={styles.ringSvg}
        hoveredKey={hoveredKey}
        onHover={onHover}
      />
    </div>
  );
}

// ── One-shot rate (3×2) ─────────────────────────────
//
// The headline outcome metric. Coverage note appears ONLY in the empty
// state - populated state is chromeless, matching the edits/cost stat
// cards next to it in the default KPI strip.

function OneShotRateWidget({ analytics }: WidgetBodyProps) {
  const s = analytics.tool_call_stats;
  if (s.one_shot_sessions === 0) {
    // capabilityCoverageNote is silent when every reporting tool declares
    // the capability, but today only Claude Code's JSONL parser actually
    // populates tool_calls end-to-end. A Cursor-only user would get `--`
    // with no note under the generic helper, which is the D3a lie the
    // rubric exists to prevent. Name the source instead of the capability.
    return (
      <>
        <StatWidget value="--" />
        <CoverageNote text="Needs tool call logs. Available from Claude Code today; other hook-enabled tools pending." />
      </>
    );
  }
  const value = `${s.one_shot_rate}%`;
  return (
    <StatWidget
      value={value}
      onOpenDetail={openOutcomes('retries')}
      detailAriaLabel={`Open outcomes detail · ${value} one-shot rate`}
    />
  );
}

// ── Stuckness (4×2) ─────────────────────────────────
//
// Bare hero stat, same primitive as every other KPI stat in the system
// (edits, cost, one-shot-rate). No caption below the value — the
// supporting facts (n/total, recovered%) live in the detail view.
// Widget bodies stay chromeless; the title tells you what the number
// means, the detail view tells you what to do about it.

function StucknessWidget({ analytics }: WidgetBodyProps) {
  const s = analytics.stuckness;
  if (s.total_sessions === 0) {
    return <StatWidget value="--" />;
  }
  const pc = analytics.period_comparison;
  const prevStuck = pc.previous?.stuckness_rate;
  const stuckDelta: { current: number; previous: number } | null =
    prevStuck != null && prevStuck > 0 ? { current: s.stuckness_rate, previous: prevStuck } : null;

  const value = `${s.stuckness_rate}%`;
  return (
    <StatWidget
      value={value}
      delta={stuckDelta}
      deltaInvert
      onOpenDetail={() => navigateToDetail('outcomes', 'sessions', 'stall')}
      detailAriaLabel={`Open outcomes detail · ${value} stuck rate`}
    />
  );
}

// ── Completion by scope (6×3) ───────────────────────
//
// Scope terrace. Scope is ordinal, so render a stepped terrain: each
// terrace is one file-scope bucket, with vertical position carrying
// completion. Labels stay in DOM outside the geometry to avoid overlap.

function ScopeComplexityWidget({ analytics }: WidgetBodyProps) {
  const sc = analytics.scope_complexity.filter((b) => b.sessions > 0);
  if (sc.length < 2) {
    return (
      <SectionEmpty>
        {sc.length === 0
          ? 'Appears after sessions touch files'
          : 'Needs at least two buckets with sessions'}
      </SectionEmpty>
    );
  }

  return (
    <div className={styles.scopeFrame}>
      <ScopeTerrace buckets={sc} />
    </div>
  );
}

function ScopeTerrace({ buckets }: { buckets: UserAnalytics['scope_complexity'] }) {
  return (
    <div
      className={styles.scopeTerrace}
      role="img"
      aria-label="Completion rate by touched-file scope"
    >
      <div className={styles.scopeTerraceViz} aria-hidden="true">
        {buckets.map((b, i) => {
          const color = completionColor(b.completion_rate);
          return (
            <span
              key={b.bucket}
              className={styles.scopeTerraceStep}
              style={
                {
                  '--row-index': i,
                  '--scope-y': `${100 - b.completion_rate}%`,
                  '--scope-color': color,
                } as CSSProperties
              }
            />
          );
        })}
      </div>
      <div className={styles.scopeTerraceLabels}>
        {buckets.map((b, i) => {
          const color = completionColor(b.completion_rate);
          return (
            <span
              key={b.bucket}
              className={styles.scopeTerraceLabel}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.scopeTerraceRate} style={{ color }}>
                {b.completion_rate}%
              </span>
              <span className={styles.scopeTerraceBucket}>{b.bucket}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export const outcomeWidgets: WidgetRegistry = {
  outcomes: OutcomesWidget,
  'one-shot-rate': OneShotRateWidget,
  stuckness: StucknessWidget,
  'scope-complexity': ScopeComplexityWidget,
};
