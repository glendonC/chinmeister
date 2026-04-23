import type { WidgetSlot } from './types.js';

/**
 * Default layout for new users. Ordered widget slots on the 12-col CSS Grid.
 * Widgets pack via grid-auto-flow:row so the visual rhythm below depends only
 * on the (colSpan, rowSpan) sum per row totalling 12 cols.
 */
export const DEFAULT_LAYOUT: WidgetSlot[] = [
  // Live presence + conflicts — 6 + 6. live-agents at rowSpan 4 so 8
  // agents (LIVE_AGENTS_CAP) fit simultaneously without overflow clipping;
  // fitContent compresses back down for smaller teams.
  { id: 'live-agents', colSpan: 6, rowSpan: 4 },
  { id: 'live-conflicts', colSpan: 6, rowSpan: 3 },

  // KPI strip — 3 × 4. Four stats at their natural 3-col size so the row
  // reads as a tab-selector group candidate (design-language pattern: stat
  // values double as tab triggers, active = full ink, inactive = --soft).
  // one-shot-rate earned default placement 2026-04-22 after the outcomes
  // sweep: CodeBurn's killer metric, honest CoverageNote empty state for
  // non-hook tools, and coverage grows only when the metric is visible.
  { id: 'edits', colSpan: 3, rowSpan: 2 },
  { id: 'cost', colSpan: 3, rowSpan: 2 },
  { id: 'cost-per-edit', colSpan: 3, rowSpan: 2 },
  { id: 'one-shot-rate', colSpan: 3, rowSpan: 2 },

  // Outcomes full-width. session-trend / edit-velocity lived here
  // historically, but the session + edit KPI stats now carry their own
  // inline sparklines (see `KpiTrend` in UsageWidgets.tsx), so a second
  // card for "the same metric, but bigger, as a line" duplicates the
  // stat it sits next to. The outcomes bar takes the row instead —
  // finished / abandoned / failed reads clean at 12 cols.
  { id: 'outcomes', colSpan: 12, rowSpan: 3 },

  // Heatmap + work types — 8 + 4
  { id: 'heatmap', colSpan: 8, rowSpan: 4 },
  { id: 'work-types', colSpan: 4, rowSpan: 3 },

  // Codebase — 6 + 6
  { id: 'directories', colSpan: 6, rowSpan: 4 },
  { id: 'files', colSpan: 6, rowSpan: 4 },

  // Codebase deep — promoted 2026-04-21 after rubric pass.
  // commit-stats earned cross-tool coverage when the Cursor/Windsurf hook
  // handlers shipped 2026-04-17, so the old Claude-Code-only gating that
  // justified catalog-only in ANALYTICS_SPEC §5.6 is stale. file-rework
  // has the highest B3 in the category — drives "open this file, review"
  // directly, per the rubric challenger pass. Full-width to match the
  // airy stat-strip pattern used elsewhere in the default layout.
  { id: 'commit-stats', colSpan: 12, rowSpan: 2 },
  { id: 'file-rework', colSpan: 12, rowSpan: 4 },

  // Tools + models — 6 + 6
  { id: 'tools', colSpan: 6, rowSpan: 3 },
  { id: 'models', colSpan: 6, rowSpan: 3 },

  // Cross-tool handoffs — full-width. Substrate-unique (no IDE can show
  // "Cursor started this file, Claude Code finished it"), so it earns
  // default placement alongside the tools/models row.
  { id: 'tool-handoffs', colSpan: 12, rowSpan: 3 },

  // Memory correlation — 12. Promoted from 8 to full-width on 2026-04-22
  // when stuckness moved down to pair with the resized projects widget.
  // memory-outcomes is the strongest D1 memory widget (completion rate
  // bucketed by shared-memory hit) and uses the extra horizontal room for
  // its bucket bar chart.
  { id: 'memory-outcomes', colSpan: 12, rowSpan: 3 },

  // Projects + stuckness — 8 + 4. Projects shrank from 12→8 on 2026-04-22
  // (the comparator-table redesign doesn't earn full width), opening room
  // for stuckness as its row partner. Bottom-row pairing keeps the layout
  // total at 12 per row and avoids leaving empty grid space.
  { id: 'projects', colSpan: 8, rowSpan: 3 },
  { id: 'stuckness', colSpan: 4, rowSpan: 2 },
];

export const DEFAULT_WIDGET_IDS = DEFAULT_LAYOUT.map((s) => s.id);
