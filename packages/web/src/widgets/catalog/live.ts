import type { WidgetDef } from './types.js';

// Live (presence / coordination) widgets — real-time snapshots that bypass the
// global date picker. Every entry uses `timeScope: 'live'` and `fitContent` so
// quiet teams collapse the cell instead of reserving empty vertical space.
export const LIVE_WIDGETS: WidgetDef[] = [
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
    drillTarget: { view: 'live', tab: 'agents', q: 'active-agents' },
    ownsClick: true,
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
    // The drill opens a single conflicts question. That is the honest
    // floor: we read multi-editor state from the live presence stream,
    // which has no historical dimension. A richer drill (recent collision
    // events, who-blocked-whom, MTTR) needs the planned conflict_events
    // table; until that ships, an extra Q here would either restate the
    // same row set or fabricate signal. Cross-link to codebase risk
    // collisions covers the historical lens.
    drillTarget: { view: 'live', tab: 'conflicts', q: 'conflicts' },
    ownsClick: true,
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
    drillTarget: { view: 'live', tab: 'files', q: 'files-in-play' },
    ownsClick: true,
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
    // anyone holding right now and how long has it been held." The
    // `q=by-claim-age` question carries the widget's sort intent
    // (locks sorted by minutes_held desc) into the Files tab so the
    // user lands on the same reading order they were already in.
    drillTarget: { view: 'live', tab: 'files', q: 'by-claim-age' },
  },
];
