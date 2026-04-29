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
