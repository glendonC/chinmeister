import type { WidgetDef } from './types.js';

// Tools & Models widgets. The category leads with three substrate-unique
// signals:
//   - tool-handoffs: completion-weighted cross-tool flow (default)
//   - tool-work-type-fit: where each tool wins, by work-type (default)
//   - tool-call-errors: error rate + top patterns (default)
// Catalog-only:
//   - one-shot-by-tool: per-vendor first-try rate (overlap with the
//     cockpit one-shot-rate KPI; users add when they want the per-tool slice)
//   - model-mix: cost hero + share strip with click-to-inspect
export const TOOLS_WIDGETS: WidgetDef[] = [
  {
    id: 'tool-work-type-fit',
    name: 'tool fit by work type',
    description:
      'Which tool finishes each kind of work most reliably in this repo. One row per tool, showing its strongest work type, completion rate, and sample size. Read it as a routing rule for where to send the next refactor or bug fix.',
    category: 'tools',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
    dataKeys: ['tool_work_type', 'tool_comparison'],
    drillTarget: { view: 'tools', tab: 'tools', q: 'work-type' },
    ownsClick: true,
  },
  {
    id: 'one-shot-by-tool',
    name: 'one-shot rate by tool',
    description:
      "How often each tool's edits work the first time, no retry. Tools with fewer than 3 sessions show a dash.",
    category: 'tools',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['tool_call_stats'],
    drillTarget: { view: 'tools', tab: 'tools', q: 'one-shot' },
    ownsClick: true,
    requiredCapability: 'toolCallLogs',
  },
  {
    id: 'model-mix',
    name: 'model mix',
    description:
      'How your spend splits across the AI models your tools use. Click a segment to inspect a single model. Share is a fact, not a recommendation that one model beats another.',
    category: 'tools',
    scope: 'both',
    viz: 'proportional-bar',
    w: 4,
    h: 3,
    minW: 3,
    minH: 2,
    maxH: 3,
    fitContent: true,
    dataKeys: ['model_outcomes', 'token_usage'],
    drillTarget: { view: 'tools', tab: 'tools', q: 'models' },
    requiredCapability: 'tokenUsage',
  },
  // tool-handoffs is a half-width flow strip entry point into the Tools flow
  // detail. The main widget reports volume, landed context, and pair mix;
  // pair-by-pair rates, timing, and recent files belong in the detail view.
  {
    id: 'tool-handoffs',
    name: 'cross-tool flow',
    description:
      'How files travel between your tools, with landed context and a compact view of the top pairs. Click in for pair-by-pair flow, gaps, and outcomes.',
    category: 'tools',
    scope: 'both',
    viz: 'proportional-bar',
    w: 6,
    h: 3,
    minW: 6,
    minH: 2,
    maxW: 6,
    maxH: 3,
    fitContent: true,
    dataKeys: ['tool_handoffs', 'tool_comparison'],
    drillTarget: { view: 'tools', tab: 'flow', q: 'pairs' },
  },
  {
    id: 'tool-call-errors',
    name: 'tool call error rate',
    description:
      "How often your agents' tool calls fail this period. Click in to see the most common errors. Captured for tools with hook integration.",
    category: 'tools',
    scope: 'both',
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['tool_call_stats'],
    drillTarget: { view: 'tools', tab: 'errors', q: 'top' },
    ownsClick: true,
    requiredCapability: 'toolCallLogs',
  },
];
