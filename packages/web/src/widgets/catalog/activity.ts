import type { WidgetDef } from './types.js';

// Activity widgets — the temporal/categorical lens: when work happens, what
// kinds of work, and which hours convert. Outcomes is the verdict surface;
// Activity is the shape of the work.
export const ACTIVITY_WIDGETS: WidgetDef[] = [
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
    viz: 'ring',
    w: 12,
    h: 4,
    minW: 8,
    minH: 4,
    dataKeys: ['work_type_distribution'],
    drillTarget: { view: 'activity', tab: 'mix', q: 'share' },
    ownsClick: true,
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
];
