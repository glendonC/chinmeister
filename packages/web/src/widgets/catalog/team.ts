import type { WidgetDef } from './types.js';

// Team widgets — substrate-unique cross-agent signals only. Productivity
// ranking and surveillance-shaped comparisons stay out: see WIDGET_ALIASES
// for the cuts and their reasoning.
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
    // The codebase Risk panel's collisions question already shows the
    // directional version of this rate (which files multiple agents
    // touched, per agent count). Drilling there reuses an answered
    // question instead of opening a new tab the team detail view does
    // not have.
    drillTarget: { view: 'codebase', tab: 'risk', q: 'collisions' },
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
    // Drill points at the same codebase Risk collisions question that
    // file-overlap uses, the conceptual area is identical (files where
    // multiple agents collided / would have collided). One drill
    // destination, two read angles. ownsClick keeps WidgetRenderer's
    // outer container hover from double-stacking the inline ↗ that
    // StatWidget paints.
    drillTarget: { view: 'codebase', tab: 'risk', q: 'collisions' },
    ownsClick: true,
  },
];
