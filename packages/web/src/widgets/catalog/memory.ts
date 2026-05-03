import type { WidgetDef } from './types.js';

// Memory widgets — each anchors a 4-5 question detail view (see body file
// doc-comments for the English questions). Catalog-only at default sizes;
// individual widgets promote to default once their MemoryDetailView slot is
// wired.
export const MEMORY_WIDGETS: WidgetDef[] = [
  {
    id: 'memory-cross-tool-flow',
    name: 'cross-tool memory',
    description:
      "Memories one tool wrote that another tool's sessions actually retrieved this period. Tool axis only; the number is reads, not the available pool.",
    category: 'memory',
    scope: 'both',
    // h: 3 is the first-paint default; fitContent grows the cell up to the
    // viz cap when content needs more.
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['cross_tool_memory_flow'],
    fitContent: true,
    drillTarget: { view: 'memory', tab: 'cross-tool', q: 'flow' },
    ownsClick: true,
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
    // Ranked tag table with proportional count bars and per-row View pills.
    // data-list is the catalog viz that matches the rendered primitive.
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 3,
    dataKeys: ['memory_categories'],
    // fitContent so a sparse categories list (1-3 rows) doesn't reserve
    // empty space. WidgetGrid measures the body's natural height and
    // shrinks the cell, capped at h:3 so a populated list still gets the
    // full slot.
    fitContent: true,
    drillTarget: { view: 'memory', tab: 'health', q: 'top-tags' },
    ownsClick: true,
  },
  {
    id: 'memory-health',
    name: 'memory totals',
    description:
      'How many memories you have live, how old they are on average, and how many have gone stale. Across every tool that wrote them.',
    category: 'memory',
    scope: 'both',
    viz: 'stat-row',
    w: 4,
    h: 2,
    minW: 3,
    maxW: 4,
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
    // h: 4 is the first-paint default; fitContent grows the cell up to the
    // data-list viz cap (clamped to grid maxH:6) when SINGLE_AUTHOR_VISIBLE
    // rows + header + SectionOverflow exceed h:4. No widget-specific
    // hardcoding required - the grid measures and adapts.
    viz: 'data-list',
    w: 6,
    h: 4,
    minW: 4,
    minH: 2,
    dataKeys: ['memory_single_author_directories'],
    fitContent: true,
    drillTarget: { view: 'memory', tab: 'authorship', q: 'concentration' },
    ownsClick: true,
  },
  {
    id: 'memory-supersession-flow',
    name: 'memory hygiene',
    description:
      'Memory Cleanup flow this period, plus the current pending review queue. Stays quiet until Memory Hygiene runs on its cadence.',
    category: 'memory',
    scope: 'both',
    viz: 'stat-row',
    w: 4,
    h: 2,
    minW: 3,
    maxW: 4,
    minH: 2,
    dataKeys: ['memory_supersession'],
    drillTarget: { view: 'memory', tab: 'hygiene', q: 'flow' },
  },
  {
    id: 'memory-secrets-shield',
    name: 'secrets blocked',
    description:
      'Secrets caught before they were saved into shared memory. Chinmeister sees writes from every tool, so it catches what no individual tool can.',
    category: 'memory',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 3,
    maxW: 3,
    minH: 2,
    dataKeys: ['memory_secrets_shield'],
    drillTarget: { view: 'memory', tab: 'health', q: 'secrets' },
    ownsClick: true,
  },
  {
    id: 'memory-outcomes',
    name: 'outcomes by memory use',
    description:
      "How often sessions that read memory finish, compared to sessions that didn't. Session-grain comparison; the per-memory question lives inside the Memory detail view's Health tab.",
    category: 'memory',
    scope: 'both',
    viz: 'ring',
    w: 4,
    h: 3,
    minW: 4,
    maxW: 4,
    minH: 3,
    maxH: 3,
    dataKeys: ['memory_outcome_correlation'],
    drillTarget: { view: 'memory', tab: 'health', q: 'outcomes' },
  },
];
