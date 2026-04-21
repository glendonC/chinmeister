import { setQueryParam } from '../../lib/router.js';
import type { UserAnalytics } from '../../lib/apiSchemas.js';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import { StatWidget, CoverageNote, capabilityCoverageNote } from './shared.js';

function openUsage(tab: string) {
  return () => setQueryParam('usage', tab);
}

// True when no day in the period was observed — distinct from "days were
// observed but every metric was zero." Widgets render `--` in the first
// case and `0` in the second, so the user can tell "system captured
// nothing" apart from "I genuinely did no work."
function isEmptyPeriod(analytics: UserAnalytics): boolean {
  return analytics.daily_trends.length === 0;
}

/**
 * In-window delta: split daily_trends in half by position and compare sums.
 * Preferred over `period_comparison` for stat deltas because the worker's
 * 30-day session retention (`SESSION_RETENTION_DAYS`) structurally empties
 * the `[days*2, days]`-ago previous window used by `queryPeriodComparison`,
 * so that delta is null for every production user. Splitting the current
 * window sidesteps retention and keeps the delta honest for any period.
 * Returns null with fewer than two observed days. For odd counts the single
 * middle day is dropped so both halves span the same day count.
 */
function splitPeriodDelta<T>(
  days: T[],
  select: (row: T) => number,
): { current: number; previous: number } | null {
  if (days.length < 2) return null;
  const mid = Math.floor(days.length / 2);
  const currentStart = days.length % 2 === 0 ? mid : mid + 1;
  const previous = days.slice(0, mid).reduce((s, d) => s + select(d), 0);
  const current = days.slice(currentStart).reduce((s, d) => s + select(d), 0);
  return { current, previous };
}

/**
 * Screen-reader suffix mirroring the visual delta glyph (↑/↓/→). Empty when
 * the visual delta is suppressed (null or previous <= 0).
 */
function deltaAriaSuffix(delta: { current: number; previous: number } | null): string {
  if (!delta || delta.previous <= 0) return '';
  const diff = delta.current - delta.previous;
  if (diff === 0) return ', no change from the previous half of this period';
  const magnitude = Math.abs(Math.round(diff * 10) / 10).toLocaleString();
  const direction = diff > 0 ? 'up' : 'down';
  return `, ${direction} ${magnitude} from the previous half of this period`;
}

function SessionsWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const v = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.sessions);
  const ariaDelta = deltaAriaSuffix(delta);
  const display = v.toLocaleString();
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('sessions')}
      detailAriaLabel={`Open usage detail · ${display} sessions${ariaDelta}`}
    />
  );
}

function EditsWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const v = analytics.daily_trends.reduce((s, d) => s + d.edits, 0);
  // Delta source is in-period split, not period_comparison.edit_velocity —
  // the latter mixes a rate (edits/hr) against a totals hero, and its
  // previous window is structurally empty under 30-day retention.
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.edits);
  const ariaDelta = deltaAriaSuffix(delta);
  const display = v.toLocaleString();
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('edits')}
      detailAriaLabel={`Open usage detail · ${display} edits${ariaDelta}`}
    />
  );
}

// Lines added/removed don't have a dedicated tab — they're a subset of the
// edits story, so they drill into the Edits tab where by-tool + most-touched
// file breakdowns give them context.
function LinesAddedWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const v = analytics.daily_trends.reduce((s, d) => s + d.lines_added, 0);
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.lines_added);
  const ariaDelta = deltaAriaSuffix(delta);
  const display = `+${v.toLocaleString()}`;
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('edits')}
      detailAriaLabel={`Open usage detail · ${display} lines added${ariaDelta}`}
    />
  );
}

function LinesRemovedWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const v = analytics.daily_trends.reduce((s, d) => s + d.lines_removed, 0);
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.lines_removed);
  const ariaDelta = deltaAriaSuffix(delta);
  const display = `-${v.toLocaleString()}`;
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('edits')}
      detailAriaLabel={`Open usage detail · ${display} lines removed${ariaDelta}`}
    />
  );
}

// files_touched_total comes from COUNT(DISTINCT file_path) on the edits
// table — uncapped. Distinct from file_heatmap.length, which is the
// ranked top-50 list and would silently cap this stat at 50. Capture
// gate is hook-enabled tools (Claude Code, Cursor, Windsurf); the
// CoverageNote discloses this when non-hook tools are active.
function FilesTouchedWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const n = analytics.files_touched_total;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'hooks');
  const display = n.toLocaleString();
  return (
    <>
      <StatWidget
        value={display}
        onOpenDetail={openUsage('files-touched')}
        detailAriaLabel={`Open usage detail · ${display} files touched`}
      />
      <CoverageNote text={note} />
    </>
  );
}

function CostWidget({ analytics }: WidgetBodyProps) {
  const t = analytics.token_usage;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'tokenUsage');
  const hasData = t.sessions_with_token_data > 0;
  const value = hasData ? `$${t.total_estimated_cost_usd.toFixed(2)}` : '--';
  return (
    <>
      <StatWidget
        value={value}
        onOpenDetail={hasData ? openUsage('cost') : undefined}
        detailAriaLabel={hasData ? `Open usage detail · ${value} cost` : undefined}
      />
      <CoverageNote text={note} />
    </>
  );
}

function CostPerEditWidget({ analytics }: WidgetBodyProps) {
  const cpe = analytics.token_usage.cost_per_edit;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'tokenUsage');
  const hasData = cpe != null;
  const value = hasData ? `$${cpe.toFixed(3)}` : '--';
  return (
    <>
      <StatWidget
        value={value}
        onOpenDetail={hasData ? openUsage('cost-per-edit') : undefined}
        detailAriaLabel={hasData ? `Open usage detail · ${value} per edit` : undefined}
      />
      <CoverageNote text={note} />
    </>
  );
}

export const usageWidgets: WidgetRegistry = {
  sessions: SessionsWidget,
  edits: EditsWidget,
  'lines-added': LinesAddedWidget,
  'lines-removed': LinesRemovedWidget,
  'files-touched': FilesTouchedWidget,
  cost: CostWidget,
  'cost-per-edit': CostPerEditWidget,
};
