import type { WidgetDef } from './types.js';

// Team widgets — substrate-unique cross-agent signals only. Productivity
// ranking and surveillance-shaped comparisons stay out of the catalog.
export const TEAM_WIDGETS: WidgetDef[] = [
  {
    id: 'file-overlap',
    name: 'file overlap',
    description:
      "Share of files this period that more than one agent worked on. The kind of cross-agent visibility no single IDE has. Solo users see a 'requires 2+ agents' empty state. Not a directional metric; high overlap can also mean paired work.",
    category: 'team',
    scope: 'both',
    // viz: 'stat' (not 'stat-row') so VIZ_MAX_CONSTRAINTS caps maxW at 4 —
    // matches every other KPI stat in the cockpit (cost, edits, sessions,
    // stuckness, one-shot-rate). The body renders a single hero StatWidget,
    // not a parallel row of values, so 'stat' is the honest classification.
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['file_overlap'],
    // Drills to the codebase Risk panel's overlap-rate question, which
    // renders the same density rate as a HeroStat alongside the raw
    // file counts. The widget hero is the rate; the detail's
    // overlap-rate slot is the answer prose plus the same numbers
    // restated, with relatedLinks to the file-list collisions question
    // and the cross-tool flow view. One drill destination, one matching
    // question, no team detail view required.
    drillTarget: { view: 'codebase', tab: 'risk', q: 'overlap-rate' },
    // The body wires onOpenDetail through StatWidget so the inline ↗
    // affordance matches Usage/Outcomes stats. Without this gate,
    // WidgetRenderer would paint its outer container hover on top,
    // double-stacking the click affordance.
    ownsClick: true,
  },
  {
    id: 'conflicts-blocked',
    name: 'conflicts blocked',
    description:
      'Edits chinmeister stopped this period before two agents could collide on the same file. The coordination layer doing its job.',
    category: 'team',
    scope: 'both',
    // viz: 'stat' so VIZ_MAX_CONSTRAINTS caps maxW at 4 — same rationale as
    // file-overlap above. The body is a single-hero StatWidget, classify
    // honestly so saved layouts can't drag it past KPI-card width.
    viz: 'stat',
    w: 3,
    h: 2,
    minW: 2,
    minH: 2,
    dataKeys: ['conflict_stats'],
    requiredCapability: 'hooks',
    // Drills to the codebase Risk panel's blocked-count question, which
    // renders the same blocked total as a HeroStat plus a daily trend
    // sparkline and the block-rate (blocked/found). The widget hero is
    // the count; the detail's blocked-count slot is the count plus
    // trend plus the advisory-vs-blocked split. ownsClick keeps
    // WidgetRenderer's outer container hover from double-stacking the
    // inline ↗ that StatWidget paints.
    drillTarget: { view: 'codebase', tab: 'risk', q: 'blocked-count' },
    ownsClick: true,
  },
];
