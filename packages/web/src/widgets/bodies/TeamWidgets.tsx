import type { CSSProperties } from 'react';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.js';
import { navigateToDetail } from '../../lib/router.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import styles from './TeamWidgets.module.css';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import {
  capabilityCoverageNote,
  CoverageNote,
  InlineDelta,
  isSoloTeam,
  Sparkline,
  splitPeriodDelta,
  StatWidget,
} from './shared.js';

// Cap on icons rendered before collapsing the rest into a `+N` overflow tag.
// 3 chosen to keep the column scannable at the default tile width while still
// accommodating the realistic 1-3 tools-per-project case without overflow.
const PROJECT_TOOLS_VISIBLE = 3;

interface HostMetric {
  host_tool: string;
  joins: number;
}

function ProjectsWidget({ summaries, liveAgents, selectTeam }: WidgetBodyProps) {
  if (summaries.length === 0) return <SectionEmpty>No projects</SectionEmpty>;

  return (
    <div className={styles.projectsTable}>
      <div className={styles.projectsTableHeader}>
        <span>Project</span>
        <span>Tools</span>
        <span>Activity</span>
        <span className={styles.projectsHeaderNum}>Memories</span>
        <span className={styles.projectsHeaderNum}>Conflicts</span>
        <span aria-hidden="true" />
      </div>
      <div className={styles.projectsTableBody}>
        {summaries.map((s, i) => {
          const teamId = (s.team_id as string) || '';
          const teamName = (s.team_name as string) || teamId;
          const memoryCount = (s.memory_count as number) || 0;
          const memoryPrev = s.memory_count_previous as number | undefined;
          const conflicts7d = s.conflicts_7d as number | undefined;
          const conflicts7dPrev = s.conflicts_7d_previous as number | undefined;
          const daily = s.daily_sessions_7d as number[] | undefined;
          const hostsConfigured = (s.hosts_configured as HostMetric[] | undefined) ?? [];

          // Live tool set for this team — derived from liveAgents on the
          // client rather than added to the backend payload. liveAgents is
          // already on the wire for the live-agents widget; deriving here
          // keeps both widgets' live state in lockstep.
          const liveTools = new Set(
            liveAgents.filter((a) => a.teamId === teamId).map((a) => a.host_tool),
          );

          // Sort: live tools first, then idle by join count desc. Live state
          // is signaled by full opacity vs. dimmed idle — no overlay glyphs.
          const sortedTools = [...hostsConfigured].sort((a, b) => {
            const aLive = liveTools.has(a.host_tool);
            const bLive = liveTools.has(b.host_tool);
            if (aLive !== bLive) return aLive ? -1 : 1;
            return b.joins - a.joins;
          });
          const visibleTools = sortedTools.slice(0, PROJECT_TOOLS_VISIBLE);
          const overflow = sortedTools.length - visibleTools.length;

          // Deltas suppress when the previous value is unknown (older
          // payloads or the field hasn't shipped yet). Showing a +N against
          // an assumed-zero previous would lie about growth.
          const memoryDelta = memoryPrev != null ? memoryCount - memoryPrev : null;
          const conflictsDelta =
            conflicts7d != null && conflicts7dPrev != null ? conflicts7d - conflicts7dPrev : null;

          return (
            <button
              key={teamId}
              type="button"
              className={styles.projectsTableRow}
              style={{ '--row-index': i } as CSSProperties}
              onClick={() => selectTeam(teamId)}
              aria-label={`Open ${teamName}`}
            >
              <span className={styles.projectsName}>{teamName}</span>

              <span className={styles.projectsCell}>
                {visibleTools.length === 0 ? (
                  <span className={styles.projectsEmpty}>—</span>
                ) : (
                  <span className={styles.projectsTools}>
                    {visibleTools.map((t) => {
                      const isLive = liveTools.has(t.host_tool);
                      const meta = getToolMeta(t.host_tool);
                      return (
                        <span
                          key={t.host_tool}
                          className={isLive ? styles.toolLive : styles.toolIdle}
                          title={isLive ? `${meta.label} (active)` : meta.label}
                        >
                          <ToolIcon tool={t.host_tool} size={16} />
                        </span>
                      );
                    })}
                    {overflow > 0 && <span className={styles.toolOverflow}>+{overflow}</span>}
                  </span>
                )}
              </span>

              <span
                className={styles.projectsActivityCell}
                title="Daily sessions over the last 7 days"
              >
                {daily && daily.length >= 2 ? (
                  <Sparkline values={daily} height={20} endDot />
                ) : (
                  <span className={styles.projectsEmpty}>—</span>
                )}
              </span>

              <span className={styles.projectsNumCell}>
                <span className={styles.projectsNumValue}>{memoryCount.toLocaleString()}</span>
                {memoryDelta != null && memoryDelta !== 0 && <InlineDelta value={memoryDelta} />}
              </span>

              <span className={styles.projectsNumCell}>
                {conflicts7d != null ? (
                  <>
                    <span className={styles.projectsNumValue}>{conflicts7d.toLocaleString()}</span>
                    {conflictsDelta != null && conflictsDelta !== 0 && (
                      <InlineDelta value={conflictsDelta} invert />
                    )}
                  </>
                ) : (
                  <span className={styles.projectsEmpty}>—</span>
                )}
              </span>

              <span className={styles.projectsViewButton}>View</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  // the earlier half is 0 (sparse prevention case, common at low N) —
  // forcing an arrow against a 0 baseline would lie.
  const delta = splitPeriodDelta(cs.daily_blocked ?? [], (d) => d.blocked);
  const value = cs.blocked_period.toLocaleString();
  // Populated state stays bare. Capability attribution belongs on the
  // data-quality surface, not stacked under every cockpit stat.
  return (
    <StatWidget
      value={value}
      delta={delta}
      onOpenDetail={() => navigateToDetail('codebase', 'risk', 'collisions')}
      detailAriaLabel={`Open codebase risk · ${value} collisions blocked`}
    />
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
  projects: ProjectsWidget,
};
