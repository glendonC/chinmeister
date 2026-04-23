import type { WidgetDef, WidgetSlot } from './types.js';
import { VIZ_MAX_CONSTRAINTS } from './viz-constraints.js';
import { widgetColSpan, widgetRowSpan } from './span.js';
import { LIVE_WIDGETS } from './categories/live.js';
import { USAGE_WIDGETS } from './categories/usage.js';
import { OUTCOMES_WIDGETS } from './categories/outcomes.js';
import { ACTIVITY_WIDGETS } from './categories/activity.js';
import { CODEBASE_WIDGETS } from './categories/codebase.js';
import { TOOLS_WIDGETS } from './categories/tools.js';

/**
 * Flat list of every widget the dashboard knows about. Assembled from
 * per-category modules under ./categories/ so a new widget or category
 * change touches one file. Order reflects the category enumeration;
 * consumers filter/map, no code depends on array position.
 */
const REMAINING_WIDGETS: WidgetDef[] = [
  // ── Conversations ─────────────────────
  {
    id: 'topics',
    name: 'topics',
    description:
      'What your prompts are about. Classified from conversation content, so it tracks intent (what you asked for) — not code changes (what landed).',
    category: 'conversations',
    scope: 'both',
    viz: 'topic-bars',
    w: 4,
    h: 3,
    minW: 3,
    minH: 2,
    dataKeys: ['conversation'],
    fitContent: true,
  },

  // ── Memory ────────────────────────────
  {
    id: 'memory-activity',
    name: 'memory activity',
    description: 'Searches, hit rate, and new memories this period',
    category: 'memory',
    scope: 'both',
    viz: 'stat-row',
    w: 6,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['memory_usage'],
  },
  {
    id: 'memory-health',
    name: 'memory health',
    description: 'Total memories, average age, and stale count across all time',
    category: 'memory',
    scope: 'both',
    viz: 'stat-row',
    w: 6,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['memory_usage'],
    timeScope: 'all-time',
  },

  // ── Team ──────────────────────────────
  {
    id: 'team-members',
    name: 'team members',
    description: 'Teammates and their session/edit activity',
    category: 'team',
    scope: 'both',
    viz: 'data-list',
    w: 12,
    h: 3,
    minW: 6,
    minH: 2,
    dataKeys: ['member_analytics'],
  },

  // ── Conversations (extended) ────────
  {
    id: 'prompt-clarity',
    name: 'prompt clarity',
    description:
      'How phrasing quality correlates with session outcomes. Re-asks and confused prompts often mean the agent needs more memory or scope.',
    category: 'conversations',
    scope: 'both',
    viz: 'bar-chart',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['conversation'],
  },
  {
    id: 'conversation-depth',
    name: 'conversation depth',
    description:
      'Edit output and completion rate bucketed by session turn count. Snapshot view of the current period — see prompt-efficiency for the same axis trended over time.',
    category: 'conversations',
    scope: 'both',
    viz: 'bucket-chart',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['conversation_edit_correlation'],
  },

  // ── Memory (extended) ───────────────
  {
    id: 'memory-outcomes',
    name: 'outcomes by memory',
    description: 'How memory usage correlates with session success',
    category: 'memory',
    scope: 'both',
    viz: 'bar-chart',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['memory_outcome_correlation'],
  },
  {
    id: 'top-memories',
    name: 'top memories',
    description: 'Most-accessed shared memories',
    category: 'memory',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['top_memories'],
  },
  {
    id: 'memory-safety',
    name: 'memory safety',
    description: 'Review queue: proposals, auditor flags, and secrets blocks needing attention',
    category: 'memory',
    scope: 'both',
    viz: 'stat-row',
    w: 6,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['memory_usage'],
    timeScope: 'live',
  },

  // ── Team (extended) ─────────────────
  {
    id: 'conflict-impact',
    name: 'conflict impact',
    description: 'How conflicts affect session completion',
    category: 'team',
    scope: 'both',
    viz: 'stat-row',
    w: 6,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['conflict_correlation'],
  },
  {
    id: 'conflicts-blocked',
    name: 'conflicts blocked',
    description: 'Edits the PreToolUse hook prevented this period',
    category: 'team',
    scope: 'both',
    viz: 'stat-row',
    w: 4,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['conflict_stats'],
  },
  {
    id: 'retry-patterns',
    name: 'recurring failures',
    description: 'Files edited repeatedly across failed sessions',
    category: 'team',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['retry_patterns'],
  },
  {
    id: 'file-overlap',
    name: 'file overlap',
    description: 'Share of files touched by more than one agent',
    category: 'team',
    scope: 'both',
    viz: 'stat-row',
    w: 4,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['file_overlap'],
  },
];

export const WIDGET_CATALOG: WidgetDef[] = [
  ...LIVE_WIDGETS,
  ...USAGE_WIDGETS,
  ...OUTCOMES_WIDGETS,
  ...ACTIVITY_WIDGETS,
  ...CODEBASE_WIDGETS,
  ...TOOLS_WIDGETS,
  ...REMAINING_WIDGETS,
];

export const WIDGET_MAP = new Map(
  WIDGET_CATALOG.map((w) => {
    const vizMax = VIZ_MAX_CONSTRAINTS[w.viz];
    return [
      w.id,
      {
        ...w,
        maxW: w.maxW ?? vizMax?.maxW,
        maxH: w.maxH ?? vizMax?.maxH,
      },
    ];
  }),
);

export function getWidget(id: string): WidgetDef | undefined {
  return WIDGET_MAP.get(id);
}

/**
 * Build a WidgetSlot for an id using catalog defaults. Returns null when the
 * id isn't in the catalog.
 */
export function defaultSlot(id: string): WidgetSlot | null {
  const def = getWidget(id);
  if (!def) return null;
  return { id, colSpan: widgetColSpan(def), rowSpan: widgetRowSpan(def) };
}
