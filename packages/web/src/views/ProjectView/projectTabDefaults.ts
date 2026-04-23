// Default widget layouts for each project tab. These are starter sets
// that suggest the intent of each tab. Users can customize freely.

import type { WidgetSlot } from '../../widgets/widget-catalog.js';

// Activity tab — live operational surface. Who's working in this repo
// right now, what files are contested, what's in play. KPI strip below
// for at-a-glance project health. Trends tab owns the historical charts.
export const ACTIVITY_DEFAULT_LAYOUT: WidgetSlot[] = [
  // Live presence + conflicts side by side
  { id: 'live-agents', colSpan: 6, rowSpan: 3 },
  { id: 'live-conflicts', colSpan: 6, rowSpan: 3 },
  // Files in play (full width)
  { id: 'files-in-play', colSpan: 12, rowSpan: 3 },
  // At-a-glance KPI strip
  { id: 'sessions', colSpan: 3, rowSpan: 2 },
  { id: 'edits', colSpan: 3, rowSpan: 2 },
  { id: 'cost', colSpan: 3, rowSpan: 2 },
  { id: 'files-touched', colSpan: 3, rowSpan: 2 },
];

// Trends tab — historical reflection. Bigger charts, full coverage.
export const TRENDS_DEFAULT_LAYOUT: WidgetSlot[] = [
  // Lead with completion-rate over time + the outcome bar. Replaces
  // `session-trend` after that widget was cut from the catalog — session
  // counts live on the KPI strip below, and this tab is for questions
  // the KPI strip can't answer (shape + composition of outcomes).
  { id: 'outcome-trend', colSpan: 8, rowSpan: 3 },
  { id: 'outcomes', colSpan: 4, rowSpan: 3 },
  { id: 'heatmap', colSpan: 8, rowSpan: 4 },
  { id: 'work-types', colSpan: 4, rowSpan: 3 },
  { id: 'directories', colSpan: 6, rowSpan: 4 },
  { id: 'files', colSpan: 6, rowSpan: 4 },
  { id: 'tools', colSpan: 6, rowSpan: 3 },
  { id: 'models', colSpan: 6, rowSpan: 3 },
  { id: 'stuckness', colSpan: 6, rowSpan: 3 },
  { id: 'first-edit', colSpan: 6, rowSpan: 3 },
  { id: 'topics', colSpan: 6, rowSpan: 3 },
  { id: 'prompt-clarity', colSpan: 6, rowSpan: 3 },
];
