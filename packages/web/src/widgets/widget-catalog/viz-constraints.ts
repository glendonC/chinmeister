import type { WidgetViz } from './types.js';

/**
 * Per-visualization default size ceilings. Applied when a widget def omits
 * explicit maxW/maxH. Explicit per-widget caps override these.
 */
export const VIZ_MAX_CONSTRAINTS: Record<WidgetViz, { maxW: number; maxH: number }> = {
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
