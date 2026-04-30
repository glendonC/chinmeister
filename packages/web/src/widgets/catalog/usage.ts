import type { WidgetDef } from './types.js';

// Usage widgets — KPI stats that quantify volume across every tool, plus the
// cross-project comparator. All read from `daily_trends`, `token_usage`, or
// `file_heatmap` and respond to the global date picker.
export const USAGE_WIDGETS: WidgetDef[] = [
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
    drillTarget: { view: 'usage', tab: 'cost', q: 'per-edit' },
    ownsClick: true,
    requiredCapability: 'tokenUsage',
  },
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
    drillTarget: { view: 'usage', tab: 'projects', q: 'overview' },
    ownsClick: true,
  },
];
