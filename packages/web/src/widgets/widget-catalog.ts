import type { DataCapabilities } from '@chinmeister/shared/tool-registry.js';
import type { DetailViewKey } from '../lib/router.js';

/**
 * Widget catalog: every data point that can appear on the overview.
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

// ── The catalog ──────────────────────────────────

export const WIDGET_CATALOG: WidgetDef[] = [
  // ── Live (presence / coordination) ────
  {
    id: 'live-agents',
    name: 'live agents',
    description: 'Agents working in this team right now, across every tool you use.',
    category: 'live',
    scope: 'both',
    viz: 'live-list',
    w: 6,
    h: 4,
    minW: 4,
    minH: 2,
    dataKeys: ['dashboard'],
    timeScope: 'live',
    fitContent: true,
  },
  {
    id: 'live-conflicts',
    name: 'live conflicts',
    description:
      "Files multiple agents are editing right now. Coordinate on these before they stomp on each other's edits.",
    category: 'live',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['dashboard'],
    timeScope: 'live',
    fitContent: true,
  },
  {
    id: 'files-in-play',
    name: 'files being edited',
    description:
      'Files at least one agent has open right now, across every tool. A glance here before you pick what to work on next.',
    category: 'live',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['dashboard'],
    timeScope: 'live',
    fitContent: true,
  },
  {
    id: 'claimed-files',
    name: 'claimed files',
    description:
      'Files an agent has reserved so others stay out while it works. Claims that hang around for a while are worth a look.',
    category: 'live',
    scope: 'project',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['dashboard'],
    timeScope: 'live',
    fitContent: true,
    // Drill opens the LiveNow Files tab where claims show up alongside
    // unclaimed files-in-play, so a single surface answers "what is
    // anyone holding right now and how long has it been held."
    drillTarget: { view: 'live', tab: 'files' },
  },

  // ── Usage (KPI stats) ─────────────────
  {
    id: 'sessions',
    name: 'sessions',
    description:
      'How many agent sessions ran across every tool this period. Click in for outcomes, cost, or files.',
    category: 'usage',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['daily_trends'],
    drillTarget: { view: 'usage', tab: 'sessions' },
    ownsClick: true,
  },
  {
    id: 'edits',
    name: 'edits',
    description:
      'How many file edits your agents made this period. Read it next to outcomes and one-shot rate; volume only matters if the work ships.',
    category: 'usage',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['daily_trends'],
    drillTarget: { view: 'usage', tab: 'edits' },
    ownsClick: true,
  },
  {
    id: 'lines-added',
    name: 'lines added',
    description:
      'Lines your agents added this period. A volume signal, not a productivity score, so read it next to outcomes and rework.',
    category: 'usage',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['daily_trends'],
    drillTarget: { view: 'usage', tab: 'lines' },
    ownsClick: true,
  },
  {
    id: 'lines-removed',
    name: 'lines removed',
    description:
      'Lines your agents removed this period. A volume signal, not a productivity score, so read it next to outcomes and rework.',
    category: 'usage',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['daily_trends'],
    drillTarget: { view: 'usage', tab: 'lines' },
    ownsClick: true,
  },
  {
    id: 'files-touched',
    name: 'files touched',
    description:
      'Unique files your agents touched this period. Click in to see where the work concentrated.',
    category: 'usage',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['file_heatmap'],
    drillTarget: { view: 'usage', tab: 'files-touched' },
    ownsClick: true,
  },
  {
    id: 'cost',
    name: 'cost',
    description:
      'Estimated spend from token usage across every tool and model this period. Click in to find expensive sessions or models worth swapping.',
    category: 'usage',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['token_usage'],
    drillTarget: { view: 'usage', tab: 'cost' },
    ownsClick: true,
    requiredCapability: 'tokenUsage',
  },
  {
    id: 'cost-per-edit',
    name: 'cost per edit',
    description:
      'Estimated cost per file edit, across sessions where we have token data. Read it next to outcomes; a high ratio with low completion is the waste signal, not the ratio on its own.',
    category: 'usage',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['token_usage'],
    drillTarget: { view: 'usage', tab: 'cost-per-edit' },
    ownsClick: true,
    requiredCapability: 'tokenUsage',
  },
  // ── Outcomes ──────────────────────────
  {
    id: 'outcomes',
    name: 'outcomes',
    description:
      'How sessions ended this period: finished, abandoned, or failed. Click in for the full list with per-file context.',
    category: 'outcomes',
    scope: 'both',
    viz: 'outcome-bar',
    // 8-col width is required for the hero-stat + 5-column table
    // (OUTCOME / COUNT / SHARE bar / DELTA / TREND sparkline). Share bars
    // become legible, per-outcome trend sparklines fit, drill arrows have
    // room. A narrower slot clips labels and forces the table into a
    // column.
    w: 8,
    h: 3,
    minW: 6,
    minH: 2,
    maxW: 12,
    dataKeys: ['completion_summary'],
    drillTarget: { view: 'outcomes', tab: 'sessions' },
    ownsClick: true,
  },
  {
    id: 'outcome-trend',
    name: 'completion rate trend',
    description: 'Your daily completion rate over time.',
    category: 'outcomes',
    scope: 'both',
    viz: 'sparkline',
    w: 8,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['daily_trends'],
    fitContent: true,
    drillTarget: { view: 'outcomes', tab: 'sessions' },
  },
  {
    id: 'one-shot-rate',
    name: 'one-shot rate',
    description: 'How often your agents got the edit right on the first try, no retry needed.',
    category: 'outcomes',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['tool_call_stats'],
    drillTarget: { view: 'outcomes', tab: 'retries' },
    ownsClick: true,
    requiredCapability: 'toolCallLogs',
  },
  {
    id: 'stuckness',
    name: 'stuck sessions',
    description: 'Sessions where the agent went quiet for 15 minutes or more.',
    category: 'outcomes',
    scope: 'both',
    // viz: 'stat' so the hero value uses --display-hero like one-shot-rate,
    // edits, cost, cost-per-edit — every KPI-shape widget in the system
    // renders at the same typography tier. The ratio + recovered% live in
    // the CoverageNote caption slot so they're visible without stealing
    // the hero tier.
    viz: 'stat',
    w: 4,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['stuckness'],
    drillTarget: { view: 'outcomes', tab: 'sessions' },
    ownsClick: true,
  },

  // ── Activity ──────────────────────────
  {
    id: 'heatmap',
    name: 'activity heatmap',
    description: 'When you run agent sessions, by hour and day of week.',
    category: 'activity',
    scope: 'both',
    viz: 'heatmap',
    w: 12,
    h: 3,
    minW: 8,
    minH: 3,
    dataKeys: ['hourly_distribution'],
    drillTarget: { view: 'activity', tab: 'rhythm', q: 'peak-hour' },
  },
  {
    id: 'work-types',
    name: 'work types',
    description:
      'What kinds of work your agents are doing. Click in to see which ones ship and which ones stall.',
    category: 'activity',
    scope: 'both',
    viz: 'proportional-bar',
    w: 6,
    h: 3,
    minW: 6,
    minH: 2,
    dataKeys: ['work_type_distribution'],
    fitContent: true,
    drillTarget: { view: 'activity', tab: 'mix', q: 'share' },
  },

  // ── Codebase ──────────────────────────
  {
    id: 'commit-stats',
    name: 'commits',
    description:
      'Commits your agents made this period, across every tool. The git-side proof that sessions are actually shipping. Captured for tools with hook integration.',
    category: 'codebase',
    scope: 'both',
    viz: 'stat-row',
    w: 6,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['commit_stats'],
    drillTarget: { view: 'codebase', tab: 'commits', q: 'commits-headline' },
    requiredCapability: 'commitTracking',
  },
  {
    id: 'directories',
    name: 'top directories',
    description:
      'The 8 directories your agents work in most, with how often sessions there finish cleanly. The low-completion ones are the recurring trouble spots.',
    category: 'codebase',
    scope: 'both',
    viz: 'bar-chart',
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
    dataKeys: ['directory_heatmap'],
    drillTarget: { view: 'codebase', tab: 'directories', q: 'top-dirs' },
    ownsClick: true,
    requiredCapability: 'hooks',
  },
  {
    id: 'files',
    name: 'top files',
    description:
      'The 8 files your agents touched most this period, with completion rate and lines changed. The hotspots.',
    category: 'codebase',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
    dataKeys: ['file_heatmap'],
    drillTarget: { view: 'codebase', tab: 'landscape', q: 'landscape' },
    ownsClick: true,
    requiredCapability: 'hooks',
  },

  // ── Tools & Models ────────────────────
  // The category leads with three substrate-unique signals:
  //   - tool-handoffs: completion-weighted cross-tool flow (default)
  //   - tool-work-type-fit: where each tool wins, by work-type (default)
  //   - tool-call-errors: error rate + top patterns (default)
  // Catalog-only:
  //   - one-shot-by-tool: per-vendor first-try rate (overlap with the
  //     cockpit one-shot-rate KPI; users add when they want the per-tool slice)
  //   - model-mix: cost hero + share strip with click-to-inspect
  // Aliases below preserve saved layouts that referenced earlier ids.
  {
    id: 'tool-work-type-fit',
    name: 'tool fit by work type',
    description:
      'Which tool finishes each kind of work most reliably in this repo. One row per tool, showing its strongest work type, completion rate, and sample size. Read it as a routing rule for where to send the next refactor or bug fix.',
    category: 'tools',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
    dataKeys: ['tool_work_type', 'tool_comparison'],
    drillTarget: { view: 'tools', tab: 'tools', q: 'work-type' },
    ownsClick: true,
  },
  {
    id: 'one-shot-by-tool',
    name: 'one-shot rate by tool',
    description:
      "How often each tool's edits work the first time, no retry. Tools with fewer than 3 sessions show a dash.",
    category: 'tools',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['tool_call_stats'],
    drillTarget: { view: 'tools', tab: 'tools', q: 'one-shot' },
    ownsClick: true,
    requiredCapability: 'toolCallLogs',
  },
  {
    id: 'model-mix',
    name: 'model mix',
    description:
      'How your spend splits across the AI models your tools use. Click a segment to inspect a single model. Share is a fact, not a recommendation that one model beats another.',
    category: 'tools',
    scope: 'both',
    viz: 'proportional-bar',
    w: 4,
    h: 2,
    minW: 3,
    minH: 2,
    maxH: 2,
    dataKeys: ['model_outcomes', 'token_usage'],
    drillTarget: { view: 'tools', tab: 'tools', q: 'models' },
    requiredCapability: 'tokenUsage',
  },

  // ── Projects ──────────────────────────
  {
    id: 'projects',
    name: 'projects',
    description:
      'Compare your projects on tool mix, 7-day activity, shared memory growth, and conflict trend.',
    category: 'usage',
    scope: 'overview',
    viz: 'project-list',
    // 8-col default: the table has 6 fixed-track columns + a View pill, so a
    // half-to-two-thirds tile matches the live-agents/live-conflicts density
    // precedent. Users can resize down to 6 or up to 12 from the customize
    // panel.
    w: 8,
    h: 3,
    minW: 6,
    minH: 2,
    // Same opt-in as live-agents et al: WidgetGrid's useFitRowSpan measures
    // the table's scrollHeight and shrinks the cell's grid-row span to the
    // minimum needed (clamped at h:3 as ceiling). A single-project user
    // sees a 1-row tall cell instead of 3 rows of empty space; a
    // many-project user gets the full 3 rows + scroll inside the body.
    fitContent: true,
    dataKeys: ['dashboard'],
  },

  // ── Outcomes (extended) ─────────────
  {
    id: 'scope-complexity',
    name: 'completion by scope',
    description: 'How completion rate changes as sessions touch more files.',
    category: 'outcomes',
    scope: 'both',
    viz: 'bucket-chart',
    w: 8,
    h: 3,
    minW: 6,
    minH: 2,
    dataKeys: ['scope_complexity'],
    drillTarget: { view: 'outcomes', tab: 'retries', q: 'scope' },
  },

  // ── Codebase (extended) ─────────────
  {
    id: 'file-rework',
    name: 'files in failed sessions',
    description:
      "The 8 files that keep showing up in sessions that don't finish. The percentage is each file's fail rate: the share of its edits that landed inside non-completing sessions, not retry on the edit itself. Worth a careful look before editing again.",
    category: 'codebase',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
    dataKeys: ['file_rework'],
    drillTarget: { view: 'codebase', tab: 'risk', q: 'failing-files' },
    ownsClick: true,
  },
  {
    id: 'audit-staleness',
    name: 'cold directories',
    description:
      'Directories that used to see activity but have not been touched in 14 days or more. Ownership gaps and good candidates for pruning.',
    category: 'codebase',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['audit_staleness'],
    timeScope: 'all-time',
    drillTarget: { view: 'codebase', tab: 'directories', q: 'cold-dirs' },
    ownsClick: true,
  },
  {
    id: 'concurrent-edits',
    name: 'edit collisions',
    description: 'The 8 files multiple agents touched most this period. Coordination hotspots.',
    category: 'codebase',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['concurrent_edits'],
    drillTarget: { view: 'codebase', tab: 'risk', q: 'collisions' },
    ownsClick: true,
  },

  // ── Tools (extended) ────────────────
  // tool-handoffs is a half-width flow strip entry point into the Tools flow
  // detail. The main widget reports volume, landed context, and pair mix;
  // pair-by-pair rates, timing, and recent files belong in the detail view.
  {
    id: 'tool-handoffs',
    name: 'cross-tool flow',
    description:
      'How files travel between your tools, with landed context and a compact view of the top pairs. Click in for pair-by-pair flow, gaps, and outcomes.',
    category: 'tools',
    scope: 'both',
    viz: 'proportional-bar',
    w: 6,
    h: 3,
    minW: 6,
    minH: 3,
    maxW: 6,
    maxH: 3,
    dataKeys: ['tool_handoffs', 'tool_comparison'],
    drillTarget: { view: 'tools', tab: 'flow', q: 'pairs' },
  },
  {
    id: 'tool-call-errors',
    name: 'tool call error rate',
    description:
      "How often your agents' tool calls fail this period. Click in to see the most common errors. Captured for tools with hook integration.",
    category: 'tools',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['tool_call_stats'],
    drillTarget: { view: 'tools', tab: 'errors', q: 'top' },
    ownsClick: true,
    requiredCapability: 'toolCallLogs',
  },
  // ── Conversations ──
  // Two file-axis widgets that use sentiment/topic as inputs to coordination
  // questions, not as the headline metric ("use as input to Failure Analysis,
  // never alone"). Both gate on conversationLogs capability (Claude Code +
  // Aider today).
  {
    id: 'confused-files',
    name: 'files where the agent struggled',
    description:
      'Files where multiple sessions had messages flagged as confused or frustrated. Worth reading these alongside their memories before you edit them. Captured for tools with conversation logs.',
    category: 'conversations',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['confused_files'],
    requiredCapability: 'conversationLogs',
  },
  {
    id: 'unanswered-questions',
    name: 'questions in abandoned sessions',
    description:
      "Questions you asked in sessions that got abandoned, things the agent couldn't follow through on. Click in for the filtered session list. Captured for tools with conversation logs.",
    category: 'conversations',
    scope: 'both',
    viz: 'stat',
    // 4 cols (not 3) so the catalog title "questions in abandoned sessions"
    // fits without truncation. Matches the canonical width for enriched
    // stat cards (stuckness, one-shot-rate).
    w: 4,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['unanswered_questions'],
    requiredCapability: 'conversationLogs',
  },
  // cross-tool-handoff-questions: substrate-unique. Surfaces handoff EVENTS
  // (file × tool-from × tool-to × gap-time) where one tool's session
  // abandoned mid-question and another tool's session opened on the same
  // file with a question or confused/frustrated turn. Sentiment/topic are
  // filter inputs only, never displayed. Catalog-only because the data
  // requires 2+ tools with conversation capture; the empty state names the
  // condition. Drill emits URL params matching the session-list filter
  // spec.
  {
    id: 'cross-tool-handoff-questions',
    name: 'cross-tool question handoffs',
    description:
      "When one tool's session left a question hanging and a second tool picked up the same file with another question or a confused turn. Captured for tools with conversation logs.",
    category: 'conversations',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['cross_tool_handoff_questions'],
    requiredCapability: 'conversationLogs',
  },

  // ── Memory (extended) ───────────────
  // Each anchors a 4-5 question detail view (see body file doc-comments
  // for the English questions). Catalog-only at default sizes; individual
  // widgets promote to default once their MemoryDetailView slot is wired.
  {
    id: 'memory-cross-tool-flow',
    name: 'cross-tool memory',
    description:
      "Memories one tool wrote that another tool's sessions actually retrieved this period. Tool axis only; the number is reads, not the available pool.",
    category: 'memory',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['cross_tool_memory_flow'],
    drillTarget: { view: 'memory', tab: 'cross-tool', q: 'flow' },
  },
  {
    id: 'memory-aging-curve',
    name: 'memory freshness',
    description:
      'How many of your live memories were saved in the last 30 days. A low share means staleness is piling up.',
    category: 'memory',
    scope: 'both',
    viz: 'proportional-bar',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['memory_aging'],
    timeScope: 'all-time',
    fitContent: true,
    drillTarget: { view: 'memory', tab: 'freshness', q: 'mix' },
  },
  {
    id: 'memory-categories',
    name: 'memory categories',
    description:
      'Freeform categories your agents tag memories with. Stays empty until agents start tagging.',
    category: 'memory',
    scope: 'both',
    // The body renders a chromeless type-ladder (rank by font weight + size,
    // not bars). data-list is the catalog viz that matches the rendered
    // primitive — the prior 'bar-chart' tag was a stale leftover from a
    // pre-ladder iteration and confused the picker filter.
    viz: 'data-list',
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
    dataKeys: ['memory_categories'],
    // fitContent so a sparse categories list (1-3 rows) doesn't reserve a
    // 4th row of empty space. WidgetGrid measures the body's natural
    // height and shrinks the cell — capped at h:4 so a populated list
    // still gets the full slot.
    fitContent: true,
    drillTarget: { view: 'memory', tab: 'cross-tool', q: 'categories' },
  },
  {
    id: 'memory-health',
    name: 'memory totals',
    description:
      'How many memories you have live, how old they are on average, and how many have gone stale. Across every tool that wrote them.',
    category: 'memory',
    scope: 'both',
    viz: 'stat-row',
    w: 6,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['memory_usage'],
    timeScope: 'all-time',
    drillTarget: { view: 'memory', tab: 'health', q: 'live' },
  },
  {
    id: 'memory-bus-factor',
    name: 'memory concentration',
    description:
      'Directories where almost all the memory comes from a single person. Shows the share each directory carries, with a warn marker at 80% and up. Directory only, never names anyone.',
    category: 'memory',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['memory_single_author_directories'],
    drillTarget: { view: 'memory', tab: 'authorship', q: 'concentration' },
  },
  {
    id: 'memory-supersession-flow',
    name: 'memory hygiene',
    description:
      'Pending consolidation proposals, with how many got invalidated or merged. Stays quiet until Memory Hygiene runs on its cadence.',
    category: 'memory',
    scope: 'both',
    viz: 'stat-row',
    w: 6,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['memory_supersession'],
    timeScope: 'live',
    drillTarget: { view: 'memory', tab: 'hygiene', q: 'flow' },
  },
  {
    id: 'memory-secrets-shield',
    name: 'secrets blocked',
    description:
      'Secrets caught before they were saved into shared memory. Chinmeister sees writes from every tool, so it catches what no individual tool can.',
    category: 'memory',
    scope: 'both',
    viz: 'stat-row',
    w: 4,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['memory_secrets_shield'],
    drillTarget: { view: 'memory', tab: 'health', q: 'secrets' },
  },
  {
    id: 'hourly-effectiveness',
    name: 'completion rate by hour',
    description:
      'How often agent sessions finish cleanly, by clock hour, across every tool. Your strongest 3-hour window is highlighted.',
    category: 'activity',
    scope: 'both',
    viz: 'bar-chart',
    w: 8,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['hourly_effectiveness'],
    drillTarget: { view: 'activity', tab: 'effective-hours', q: 'peak-completion' },
  },
  {
    id: 'file-overlap',
    name: 'file overlap',
    description:
      "Share of files this period that more than one agent worked on. The kind of cross-agent visibility no single IDE has. Solo users see a 'requires 2+ agents' empty state. Not a directional metric; high overlap can also mean paired work.",
    category: 'team',
    scope: 'both',
    // viz: 'stat' (not 'stat-row') so VIZ_MAX_CONSTRAINTS caps maxW at 4 —
    // matches every other KPI stat in the cockpit (cost, edits, sessions,
    // stuckness, one-shot-rate). The body renders a single hero StatWidget,
    // not a parallel row of values, so 'stat' is the honest classification.
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['file_overlap'],
    // The codebase Risk panel's collisions question already shows the
    // directional version of this rate (which files multiple agents
    // touched, per agent count). Drilling there reuses an answered
    // question instead of opening a new tab the team detail view does
    // not have.
    drillTarget: { view: 'codebase', tab: 'risk', q: 'collisions' },
    // The body wires onOpenDetail through StatWidget so the inline ↗
    // affordance matches Usage/Outcomes stats. Without this gate,
    // WidgetRenderer would paint its outer container hover on top,
    // double-stacking the click affordance.
    ownsClick: true,
  },

  {
    id: 'memory-outcomes',
    name: 'outcomes by memory use',
    description:
      "How often sessions that read memory finish, compared to sessions that didn't. Session-grain comparison; the per-memory question lives inside the Memory detail view's Health tab.",
    category: 'memory',
    scope: 'both',
    viz: 'bar-chart',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['memory_outcome_correlation'],
    drillTarget: { view: 'memory', tab: 'health', q: 'outcomes' },
  },
  // ── Team (extended) ─────────────────
  {
    id: 'conflicts-blocked',
    name: 'conflicts blocked',
    description:
      'Edits chinmeister stopped this period before two agents could collide on the same file. The coordination layer doing its job.',
    category: 'team',
    scope: 'both',
    // viz: 'stat' so VIZ_MAX_CONSTRAINTS caps maxW at 4 — same rationale as
    // file-overlap above. The body is a single-hero StatWidget, classify
    // honestly so saved layouts can't drag it past KPI-card width.
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['conflict_stats'],
    requiredCapability: 'hooks',
    // Drill points at the same codebase Risk collisions question that
    // file-overlap uses, the conceptual area is identical (files where
    // multiple agents collided / would have collided). One drill
    // destination, two read angles. ownsClick keeps WidgetRenderer's
    // outer container hover from double-stacking the inline ↗ that
    // StatWidget paints.
    drillTarget: { view: 'codebase', tab: 'risk', q: 'collisions' },
    ownsClick: true,
  },
];

// ── Size constraints by viz type ─────────────────
// Applied as defaults — explicit maxW/maxH on a widget override these.

const VIZ_MAX_CONSTRAINTS: Record<WidgetViz, { maxW: number; maxH: number }> = {
  stat: { maxW: 4, maxH: 2 },
  'stat-row': { maxW: 12, maxH: 2 },
  sparkline: { maxW: 12, maxH: 4 },
  'multi-sparkline': { maxW: 12, maxH: 8 },
  heatmap: { maxW: 12, maxH: 6 },
  'bar-chart': { maxW: 12, maxH: 6 },
  'proportional-bar': { maxW: 12, maxH: 8 },
  'data-list': { maxW: 12, maxH: 8 },
  'outcome-bar': { maxW: 6, maxH: 4 },
  'factual-grid': { maxW: 12, maxH: 4 },
  'topic-bars': { maxW: 8, maxH: 5 },
  'project-list': { maxW: 12, maxH: 6 },
  'bucket-chart': { maxW: 12, maxH: 5 },
  'live-list': { maxW: 12, maxH: 4 },
};

// ── Lookup ───────────────────────────────────────

export const WIDGET_MAP = new Map(
  WIDGET_CATALOG.map((w) => {
    const vizMax = VIZ_MAX_CONSTRAINTS[w.viz];
    return [
      w.id,
      {
        ...w,
        maxW: w.maxW ?? vizMax?.maxW,
        maxH: w.maxH ?? vizMax?.maxH,
      },
    ];
  }),
);

export function getWidget(id: string): WidgetDef | undefined {
  return WIDGET_MAP.get(id);
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

/**
 * Build a WidgetSlot for an id using catalog defaults. Returns null when the
 * id isn't in the catalog.
 */
export function defaultSlot(id: string): WidgetSlot | null {
  const def = getWidget(id);
  if (!def) return null;
  return { id, colSpan: widgetColSpan(def), rowSpan: widgetRowSpan(def) };
}

/**
 * ID aliases for widgets that have been renamed, removed, or split. When a
 * saved layout contains a deprecated ID, the loader replaces it in place
 * with the target IDs at their catalog default sizes.
 *
 * Empty array means "the widget was removed with no replacement" — the slot
 * is dropped from the layout.
 *
 * Single-entry array = rename. Multi-entry array = split.
 */
export const WIDGET_ALIASES: Record<string, string[]> = {
  // formation-summary: the merge/evolve/discard breakdown belongs in the
  // review drill, not the cockpit.
  'formation-summary': [],
  // first-edit + duration-dist: both already render in Usage detail's
  // Sessions panel. Detail-only is the honest home when a metric only
  // earns its seat in context. duration-dist also invited the "optimal
  // session length" read, a never-build anti-pattern.
  'first-edit': [],
  'duration-dist': [],
  // session-trend: detail-view's DailyOutcomeStrip + the same-row outcomes
  // widget already own the signal with more context, and zero-fill
  // rendered fake shape for low-activity users.
  'session-trend': [],
  // edit-velocity: no detail-view earns the build cost. The only
  // substrate-honest question (velocity → completion) is a
  // Simpson's-paradox trap, and edits/hr is a generic metric any tool's
  // own dashboard produces. Schema field `edit_velocity` stays for
  // UsageDetail's `cadence` scalar consumers.
  'edit-velocity': [],

  // Activity cuts. prompt-efficiency rides the same Simpson's-paradox
  // trap that cut edit-velocity (turns ↔ outcome). work-type-outcomes
  // is fully absorbed into OutcomesDetailView's WorkTypesPanel.
  'prompt-efficiency': [],
  'work-type-outcomes': [],

  // Codebase cuts. file-churn duplicates files in practice (different
  // aggregation primitive, same ranking), and triple-volume-metric row
  // invites the "high-on-all = bad" anti-pattern read.
  'file-churn': [],

  // Tools & Models. tool-capability-coverage was static feature spec, not
  // analytics. token-attribution overlapped model-mix on substrate. Both
  // alias to empty so saved layouts drop the slot on next load.
  tools: [],
  models: ['model-mix'],
  'token-detail': [],
  'tool-capability-coverage': [],
  'token-attribution': [],

  // Tools cuts. tool-outcomes is redundant with the `tools` grid (which
  // already shows completion%). cache-efficiency is plumbing observability
  // with no user control surface. tool-daily rides the same zero-fill A3
  // failure that cut session-trend. tool-work-type carries a broken
  // denominator (sessions in multiple work types double-counted) and the
  // "per-tool distribution as pie" anti-pattern. tool-calls has polysemous
  // "calls" semantics across hook-instrumented vs MCP-only hosts.
  // tool-call-freq is pure frequency without effectiveness overlay.
  // data-coverage is a plumbing diagnostic with negative emotional payload;
  // it belongs on a Connect/Settings surface, not the cockpit.
  'tool-outcomes': [],
  'cache-efficiency': [],
  'tool-daily': [],
  'tool-work-type': [],
  'tool-calls': [],
  'tool-call-freq': [],
  'data-coverage': [],

  // Conversations originals each independently violated the
  // sentiment-as-headline firewall:
  //   topics: redundant with work-types; D1 weak (every LLM-obs tool
  //     ships it).
  //   prompt-clarity: classifier still emits sentiment polarity, the
  //     "sentiment-to-outcome standalone" pattern.
  //   conversation-depth: Simpson's-paradox trap (longer sessions =
  //     harder tasks), same family as the edit-velocity cut.
  topics: [],
  'prompt-clarity': [],
  'conversation-depth': [],
  // memory-stats / sentiment-outcomes: replacement targets are themselves
  // cut, so the historical aliases drop their slots entirely.
  'memory-stats': [],
  'sentiment-outcomes': [],

  // Memory cuts. memory-activity rendered search hit rate, an evergreen
  // anti-pattern (hit-rate-as-quality). memory-safety stays cut: the data
  // ships via memory-supersession-flow + memory-secrets-shield, and the
  // remaining auditor-flag piece is pre-empted by the Memory Hygiene
  // Autopilot Report.
  'memory-activity': [],
  'memory-safety': [],

  // top-memories: opaque previews and no denominator hit the
  // hit-rate-as-quality anti-pattern. The schema field stays; the data is
  // consumed inside MemoryDetailView's Health tab where rank + last-touch
  // + category + author can co-render in context.
  'top-memories': [],

  // Team cuts. Only conflicts-blocked survives as substrate-unique
  // prevention proof. team-members triggers the productivity-ranking
  // anti-pattern (surveillance, not intelligence) and pre-empts the
  // unbuilt privacy model. conflict-impact rides Simpson's paradox
  // (sessions hitting conflicts are also harder sessions); the
  // disclaimer line is theater in a stat-row that reads causally by
  // construction. retry-patterns is redundant with file-rework (same
  // axis, different aggregation primitive); the cross-agent + cross-tool
  // columns belong as a footer line on file-rework.
  'team-members': [],
  'conflict-impact': [],
  'retry-patterns': [],
};

/**
 * Resolve a widget id through the alias map. Returns the replacement ids
 * (one or many), or the original id if it has no alias. Does not validate
 * that the returned ids exist in the catalog — callers still need to run
 * through `defaultSlot` or `getWidget`.
 */
export function resolveWidgetAlias(id: string): string[] {
  return WIDGET_ALIASES[id] ?? [id];
}

// ── Category metadata ───────────────────────────

export const CATEGORIES: Array<{ id: WidgetCategory; label: string }> = [
  { id: 'live', label: 'live' },
  { id: 'usage', label: 'usage' },
  { id: 'outcomes', label: 'outcomes' },
  { id: 'activity', label: 'activity' },
  { id: 'codebase', label: 'codebase' },
  { id: 'tools', label: 'tools & models' },
  { id: 'conversations', label: 'conversations' },
  { id: 'memory', label: 'memory' },
  { id: 'team', label: 'team' },
];

// ── Default layout for new users ────────────────
// Ordered widget slots on the 12-col CSS Grid. Widgets pack via
// grid-auto-flow:row so the visual rhythm below depends only on the
// (colSpan, rowSpan) sum per row totalling 12 cols.

export const DEFAULT_LAYOUT: WidgetSlot[] = [
  // Live presence + conflicts — 6 + 6. live-agents at rowSpan 4 so 8
  // agents (LIVE_AGENTS_CAP) fit simultaneously without overflow clipping;
  // fitContent compresses back down for smaller teams.
  { id: 'live-agents', colSpan: 6, rowSpan: 4 },
  { id: 'live-conflicts', colSpan: 6, rowSpan: 3 },

  // KPI strip — 3 × 4. Four stats at their natural 3-col size so the row
  // reads as a tab-selector group candidate (design-language pattern: stat
  // values double as tab triggers, active = full ink, inactive = --soft).
  // one-shot-rate gets a default seat alongside the volume KPIs because
  // it is the single most informative outcome metric, and coverage of the
  // capability only grows when the metric is visible to users.
  { id: 'edits', colSpan: 3, rowSpan: 2 },
  { id: 'cost', colSpan: 3, rowSpan: 2 },
  { id: 'cost-per-edit', colSpan: 3, rowSpan: 2 },
  { id: 'one-shot-rate', colSpan: 3, rowSpan: 2 },

  // Outcomes — 8×3. Stands alone on its row. No forced backfill: the grid
  // is modular, users add other widgets via the picker if they want the
  // leftover 4 cols filled.
  { id: 'outcomes', colSpan: 8, rowSpan: 3 },

  // Activity — heatmap gets a full row; mix + effectiveness share the next row.
  { id: 'heatmap', colSpan: 12, rowSpan: 3 },
  { id: 'work-types', colSpan: 6, rowSpan: 3 },
  { id: 'hourly-effectiveness', colSpan: 6, rowSpan: 3 },

  // Codebase — directories + files. `directories` renders completion_rate
  // colored by severity, with MoreHidden tail past top-10 and a
  // hooks-capability CoverageNote. The substrate-unique angle here is
  // per-directory completion rate weighted by agent-session outcomes.
  { id: 'directories', colSpan: 6, rowSpan: 4 },
  { id: 'files', colSpan: 6, rowSpan: 4 },

  // Codebase deep. file-rework drives "open this file, review" directly.
  // commit-stats has cross-tool coverage from every host with hook
  // handlers. Full-width matches the airy stat-strip pattern used
  // elsewhere in the default layout.
  { id: 'commit-stats', colSpan: 12, rowSpan: 2 },
  { id: 'file-rework', colSpan: 12, rowSpan: 4 },

  // Tools & Models. tool-work-type-fit owns the richer routing table.
  // tool-handoffs is the half-width flow read; pair/gap breakdowns live in
  // Tools detail. Error pattern breakdowns stay behind the compact
  // tool-call-errors entry point.
  //
  // one-shot-by-tool is catalog-only: the cockpit already carries
  // one-shot-rate as a KPI stat, so the per-tool slice is a power-user
  // add via the picker.
  { id: 'tool-work-type-fit', colSpan: 6, rowSpan: 4 },
  { id: 'tool-handoffs', colSpan: 6, rowSpan: 3 },
  { id: 'tool-call-errors', colSpan: 3, rowSpan: 2 },

  // Memory — memory-outcomes is full-width to keep the bars wide enough
  // to read as data; the per-bucket min-N floor + min-2-bucket guard
  // kills the lonely-strip case.
  { id: 'memory-outcomes', colSpan: 12, rowSpan: 3 },

  // Projects + stuckness — 8 + 4. The comparator-table redesign doesn't
  // earn full width, so an 8-col projects tile pairs with stuckness on
  // the same row. Bottom-row pairing keeps the layout at 12 per row and
  // avoids leaving empty grid space.
  { id: 'projects', colSpan: 8, rowSpan: 3 },
  { id: 'stuckness', colSpan: 4, rowSpan: 2 },
];

export const DEFAULT_WIDGET_IDS = DEFAULT_LAYOUT.map((s) => s.id);
