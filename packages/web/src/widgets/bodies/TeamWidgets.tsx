import { navigateToDetail } from '../../lib/router.js';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import {
  capabilityCoverageNote,
  CoverageNote,
  isSoloTeam,
  splitPeriodDelta,
  StatWidget,
} from './shared.js';

// Both team stats compose the same primitive stack as Usage: `StatWidget`
// hero + delta + (optional) inline ↗, with at most one CoverageNote
// beneath when capability gating needs disclosure. No "X of Y" support
// facts: the breakdown belongs in the drill destination, not under the
// hero. Cost is the precedent: it shows "$X" as the hero and only paints
// a CoverageNote when capture is partial. Solo and no-activity empties
// collapse to `<StatWidget value="--" />` + reason; the bare em-dash is
// the parallel of the populated hero.

function ConflictsBlockedWidget({ analytics }: WidgetBodyProps) {
  const cs = analytics.conflict_stats;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const empty = cs.blocked_period === 0 && cs.found_period === 0;

  if (empty) {
    const note = isSoloTeam(analytics)
      ? 'Requires 2+ agents — collisions only detectable between parallel sessions.'
      : capabilityCoverageNote(tools, 'hooks');
    return (
      <>
        <StatWidget value="--" />
        <CoverageNote text={note} />
      </>
    );
  }

  // In-window split delta from daily_blocked. Mirrors the helper Usage
  // uses for sessions/edits/cost; same retention-bypass rationale (the
  // worker's `period_comparison` previous window is structurally empty
  // for every production user under 30-day retention). Suppresses when
  // the earlier half is 0 (sparse prevention case, common at low N),
  // forcing an arrow against a 0 baseline would lie.
  const delta = splitPeriodDelta(cs.daily_blocked ?? [], (d) => d.blocked);
  const value = cs.blocked_period.toLocaleString();
  return (
    <>
      <StatWidget
        value={value}
        delta={delta}
        onOpenDetail={() => navigateToDetail('codebase', 'risk', 'collisions')}
        detailAriaLabel={`Open codebase risk · ${value} collisions blocked`}
      />
      <CoverageNote text={capabilityCoverageNote(tools, 'hooks')} />
    </>
  );
}

// At team scale, file-overlap is the substrate-unique scalar "what share
// of files this period saw multiple agents touch them" that no IDE
// produces. Populated only when team_size > 1; the solo branch shows the
// empty state. Detail questions (overlap rate by directory, period trend,
// average agents-per-file in overlap subset, claim coverage when
// auto-claim ships, tool-pair contribution) live in the codebase Risk
// drill, not under the hero.
//
// Hero is the rate (overlapping/total as %). NO tone color on the hero,
// high overlap isn't inherently bad (paired work) and low overlap isn't
// inherently good (silos). No period delta renders: `file_overlap`
// carries no daily series in the schema, so `splitPeriodDelta` would
// require backend work. The body wires onOpenDetail through StatWidget
// directly so the inline ↗ matches Usage; catalog has `ownsClick: true`
// to suppress WidgetRenderer's outer container hover.
function FileOverlapWidget({ analytics }: WidgetBodyProps) {
  const fo = analytics.file_overlap;
  const solo = isSoloTeam(analytics);
  if (solo) {
    return (
      <>
        <StatWidget value="--" />
        <CoverageNote text="Requires 2+ agents — overlap only forms when multiple agents touch the same file." />
      </>
    );
  }
  if (fo.total_files === 0) {
    return (
      <>
        <StatWidget value="--" />
        <CoverageNote text="No file activity in this window." />
      </>
    );
  }
  const overlapRate = Math.round((fo.overlapping_files / fo.total_files) * 100);
  const value = `${overlapRate}%`;
  return (
    <StatWidget
      value={value}
      onOpenDetail={() => navigateToDetail('codebase', 'risk', 'collisions')}
      detailAriaLabel={`Open codebase risk · ${value} file overlap`}
    />
  );
}

export const teamWidgets: WidgetRegistry = {
  'conflicts-blocked': ConflictsBlockedWidget,
  'file-overlap': FileOverlapWidget,
};
