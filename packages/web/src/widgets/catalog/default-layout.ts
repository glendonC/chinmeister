import type { WidgetSlot } from './types.js';

// Default layout for new users. Ordered widget slots on the 12-col CSS Grid.
// Widgets pack via grid-auto-flow:row so the visual rhythm depends only on
// the (colSpan, rowSpan) sum per row totalling 12 cols.
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

  { id: 'outcomes', colSpan: 12, rowSpan: 4 },

  { id: 'heatmap', colSpan: 12, rowSpan: 3 },
  { id: 'work-types', colSpan: 12, rowSpan: 4 },
  { id: 'hourly-effectiveness', colSpan: 8, rowSpan: 3 },

  { id: 'directories', colSpan: 12, rowSpan: 4 },
  { id: 'files', colSpan: 6, rowSpan: 4 },

  // Codebase deep. file-rework pairs with the top-files table: both are
  // file-axis tables and now share the same compact half-width logic.
  { id: 'commit-stats', colSpan: 12, rowSpan: 2 },
  { id: 'file-rework', colSpan: 6, rowSpan: 4 },

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

  // Memory — memory-cross-tool-flow is the substrate-unique entry: a
  // memory written by one tool that another tool's session actually
  // retrieved this period. No single-IDE dashboard can produce this
  // signal by construction. Renders honestly empty for solo-with-one-
  // tool users (cross-tool reads are structurally impossible), and
  // grows as the user's stack widens. memory-outcomes stays available
  // via the picker; per-memory attribution waits on the
  // memory_search_results join table.
  { id: 'memory-cross-tool-flow', colSpan: 6, rowSpan: 3 },

  // Projects + stuckness. Projects is a compact comparator table; it no
  // longer needs a two-thirds row slot.
  { id: 'projects', colSpan: 6, rowSpan: 3 },
  { id: 'stuckness', colSpan: 4, rowSpan: 2 },
];

export const DEFAULT_WIDGET_IDS = DEFAULT_LAYOUT.map((s) => s.id);
