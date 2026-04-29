import type { DataCapabilities } from '@chinmeister/shared/tool-registry.js';
import type { DetailViewKey } from '../../lib/router.js';

/**
 * Widget catalog types: every data point that can appear on the overview.
 *
 * 12-column CSS Grid. Each widget declares `w` (columns it spans: 3/4/6/8/12)
 * and `h` (80px row units it spans: 2/3/4). Rows auto-fit via
 * grid-auto-flow:row so staggering is structurally impossible — short
 * widgets align at the top of their row and tall ones extend downward.
 *
 * Sizes:
 *   KPI stat card:    3 cols × 2 rows  (quarter width, compact)
 *   Enriched stat:    4 cols × 2 rows  (third width)
 *   Half chart:       6 cols × 3 rows  (half width, standard chart)
 *   Wide chart:       8 cols × 3 rows  (two-thirds)
 *   Full-width:      12 cols × 3 rows  (tables, timelines)
 *   Tall full-width: 12 cols × 4 rows  (heatmap, large viz)
 */

export type WidgetColSpan = 3 | 4 | 6 | 8 | 12;
export type WidgetRowSpan = 2 | 3 | 4;

/**
 * Layout slot persisted in localStorage. `colSpan` maps to grid-column:span,
 * `rowSpan` to grid-row:span. The grid is 12-column with 80px row units and
 * 24px gaps, so a rowSpan of 2 paints a 184px cell, 3 = 288px, 4 = 392px.
 */
export interface WidgetSlot {
  id: string;
  colSpan: WidgetColSpan;
  rowSpan: WidgetRowSpan;
}

export type WidgetViz =
  | 'stat'
  | 'stat-row'
  | 'sparkline'
  | 'multi-sparkline'
  | 'heatmap'
  | 'bar-chart'
  | 'proportional-bar'
  | 'data-list'
  | 'outcome-bar'
  | 'factual-grid'
  | 'topic-bars'
  | 'project-list'
  | 'bucket-chart'
  | 'live-list';

export type WidgetCategory =
  | 'live'
  | 'usage'
  | 'outcomes'
  | 'activity'
  | 'codebase'
  | 'tools'
  | 'conversations'
  | 'memory'
  | 'team';

/**
 * Time-semantics bucket. Drives whether a widget responds to the global date
 * picker and what label, if any, appears in its header.
 *
 *   'period'   = every number responds to the picker (default, most widgets)
 *   'live'     = real-time snapshot, picker does not apply
 *   'all-time' = lifetime values, picker does not apply
 *
 * A widget is exactly one scope. If a design needs mixed scopes, split it
 * into two widgets so users can tell which numbers the picker controls.
 */
export type WidgetTimeScope = 'period' | 'live' | 'all-time';

/**
 * Which view surfaces a widget should appear in:
 *   'overview'  — cross-project / developer-level scope only
 *   'project'   — single-project scope only
 *   'both'      — renders correctly at either scope
 * Used by the picker to filter catalog entries per view.
 */
export type WidgetScope = 'overview' | 'project' | 'both';

export interface WidgetDef {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  scope: WidgetScope;
  viz: WidgetViz;
  /** Default width in grid columns (1-12) */
  w: number;
  /** Default height in row units (~80px each) */
  h: number;
  /** Minimum width */
  minW?: number;
  /** Minimum height */
  minH?: number;
  /** Maximum width */
  maxW?: number;
  /** Maximum height */
  maxH?: number;
  /** Data keys on UserAnalytics or ConversationAnalytics */
  dataKeys: string[];
  /**
   * Time-semantics scope. Omit for the default ('period') — only set
   * explicitly for 'live' or 'all-time' widgets. See WidgetTimeScope.
   */
  timeScope?: WidgetTimeScope;
  /**
   * When true, the widget renders at its content's natural height, up to
   * the declared `h` rowSpan. WidgetGrid measures content via ResizeObserver
   * and compresses the grid-row assignment so sparse widgets don't reserve
   * empty vertical space. When content exceeds the cap, the widget body
   * scrolls. Opt-in because mixed fit + fixed widgets in the same visual
   * row may create minor y-misalignment — best reserved for widgets that
   * are commonly sparse (live presence, list overflow) rather than charts
   * with intrinsic proportions.
   */
  fitContent?: boolean;
  /**
   * Click drill destination for the cockpit widget surface. When set,
   * `WidgetRenderer` wraps the body in a clickable affordance that calls
   * `navigateToDetail(view, tab, q)` so a single click opens the matching
   * detail view, tab, and (optionally) question.
   */
  drillTarget?: { view: DetailViewKey; tab: string; q?: string };
  /**
   * The widget body wires its own click affordance — either an inline
   * `StatWidget` with `onOpenDetail`, or a table whose rows are buttons
   * with their own `View` pill. When true, `WidgetRenderer` skips the
   * outer `widgetBodyClickable` wrapper so we don't double-stack drill
   * affordances (full-container hover background + ↗ corner arrow on
   * top of an already-clickable body). The principle: full-container
   * hover is reserved for vizzes whose drill target is otherwise
   * unclear (single chart, heatmap). Tables and stat-with-deltas have
   * their own obvious click target and don't need it.
   */
  ownsClick?: boolean;
  /**
   * Capability gate that must be reported by at least one active tool for
   * this widget to populate fully. Documentation only: bodies paint their
   * own disclosure where it's load-bearing (empty states that would be
   * opaque without it). Partial-capture across the catalog lives on a
   * dedicated data-quality surface.
   */
  requiredCapability?: keyof DataCapabilities;
}

function clampColSpan(n: number): WidgetColSpan {
  if (n <= 3) return 3;
  if (n === 4) return 4;
  if (n <= 6) return 6;
  if (n <= 8) return 8;
  return 12;
}

function clampRowSpan(n: number): WidgetRowSpan {
  if (n <= 2) return 2;
  if (n === 3) return 3;
  return 4;
}

/**
 * Resolve a widget's default column span for the CSS Grid layout. Maps the
 * catalog's `w` (RGL grid units) to one of the canonical spans 3/4/6/8/12.
 * Used by views that render widgets via grid-column:span.
 */
export function widgetColSpan(def: WidgetDef): WidgetColSpan {
  return clampColSpan(def.w);
}

/**
 * Resolve a widget's default row span for the CSS Grid layout. Maps the
 * catalog's `h` (80px units) to one of 2/3/4 row spans.
 */
export function widgetRowSpan(def: WidgetDef): WidgetRowSpan {
  return clampRowSpan(def.h);
}
