import type { WidgetDef } from './types.js';

// Outcomes widgets — completion / abandonment / failure mix and its
// derivatives (one-shot rate, stuckness, scope complexity). Read together
// they answer "did the work land," which is the cockpit's headline question.
export const OUTCOMES_WIDGETS: WidgetDef[] = [
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
];
