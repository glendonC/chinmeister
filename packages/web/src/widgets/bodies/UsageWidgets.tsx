import type { CSSProperties } from 'react';
import { navigateToDetail, setQueryParam } from '../../lib/router.js';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import type { UserAnalytics } from '../../lib/apiSchemas.js';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import {
  CoverageNote,
  InlineDelta,
  Sparkline,
  StatWidget,
  costDegradedReason,
  costEmptyReason,
  deltaAriaSuffix,
  hasCostData,
  splitPeriodDelta,
} from './shared.js';
import { formatCost } from '../utils.js';
import projectsStyles from './UsageWidgets.module.css';

// Cap on icons rendered before collapsing the rest into a `+N` overflow tag.
// 3 chosen to keep the column scannable at the default tile width while still
// accommodating the realistic 1-3 tools-per-project case without overflow.
const PROJECT_TOOLS_VISIBLE = 3;

interface HostMetric {
  host_tool: string;
  joins: number;
}

function openUsage(tab: string) {
  return () => setQueryParam('usage', tab);
}

// Detail drills mount on both Overview and Project surfaces, so drill
// links resolve unconditionally. If a future surface cannot host detail
// panels, gate it at that surface rather than reintroducing a per-widget
// drill predicate.

// True when no day in the period was observed — distinct from "days were
// observed but every metric was zero." Widgets render `--` in the first
// case and `0` in the second, so the user can tell "system captured
// nothing" apart from "I genuinely did no work."
function isEmptyPeriod(analytics: UserAnalytics): boolean {
  return analytics.daily_trends.length === 0;
}

function SessionsWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const v = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.sessions);
  const ariaDelta = deltaAriaSuffix(delta);
  const display = v.toLocaleString();
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('sessions')}
      detailAriaLabel={`Open usage detail · ${display} sessions${ariaDelta}`}
    />
  );
}

function EditsWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const v = analytics.daily_trends.reduce((s, d) => s + d.edits, 0);
  // Delta source is in-period split, not period_comparison.edit_velocity —
  // the latter mixes a rate (edits/hr) against a totals hero, and its
  // previous window is structurally empty under 30-day retention.
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.edits);
  const ariaDelta = deltaAriaSuffix(delta);
  const display = v.toLocaleString();
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('edits')}
      detailAriaLabel={`Open usage detail · ${display} edits${ariaDelta}`}
    />
  );
}

// Lines added/removed drill into their own Lines tab — edit count and line
// volume are distinct questions (activity vs churn), so they get distinct
// viz. The Lines tab is built around the diverging-timeline + per-work-type
// + per-member/per-project splits that `member_daily_lines` and
// `per_project_lines` exist to power.
function LinesAddedWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const v = analytics.daily_trends.reduce((s, d) => s + d.lines_added, 0);
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.lines_added);
  const ariaDelta = deltaAriaSuffix(delta);
  const display = `+${v.toLocaleString()}`;
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('lines')}
      detailAriaLabel={`Open usage detail · ${display} lines added${ariaDelta}`}
    />
  );
}

function LinesRemovedWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const v = analytics.daily_trends.reduce((s, d) => s + d.lines_removed, 0);
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.lines_removed);
  const ariaDelta = deltaAriaSuffix(delta);
  const display = `-${v.toLocaleString()}`;
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('lines')}
      detailAriaLabel={`Open usage detail · ${display} lines removed${ariaDelta}`}
    />
  );
}

// files_touched_total comes from COUNT(DISTINCT file_path) on the edits
// table — uncapped. Distinct from file_heatmap.length, which is the
// ranked top-50 list and would silently cap this stat at 50. Capture
// gate is hook-enabled tools (Claude Code, Cursor, Windsurf); coverage
// disclosure lives on UsageDetailView so the overview stays clean.
//
// Distinct-file counts aren't additive across days, so the
// `splitPeriodDelta(daily_trends)` helper used by sessions/edits can't
// compute this delta. Instead the worker returns a pre-computed
// `files_touched_half_split` with current/previous distinct counts over
// each half of the window — null when the window is too short to split.
function FilesTouchedWidget({ analytics }: WidgetBodyProps) {
  if (isEmptyPeriod(analytics)) return <StatWidget value="--" />;
  const n = analytics.files_touched_total;
  const display = n.toLocaleString();
  const delta = analytics.files_touched_half_split;
  const ariaDelta = deltaAriaSuffix(delta);
  return (
    <StatWidget
      value={display}
      delta={delta}
      onOpenDetail={openUsage('files-touched')}
      detailAriaLabel={`Open usage detail · ${display} files touched${ariaDelta}`}
    />
  );
}

function CostWidget({ analytics }: WidgetBodyProps) {
  const t = analytics.token_usage;
  // Widen beyond the old `sessions > 0` gate: stale pricing and
  // all-models-unpriced are both "can't honestly compute" states where
  // pricing-enrich zeros the total. Rendering $0.00 in those states would
  // lie. hasCostData folds all three degraded paths into one predicate.
  const reliable = hasCostData(t);
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  // Em-dash needs a reason: stale pricing, all-models-unpriced, or capability
  // gap. costEmptyReason picks the most specific. Catalog has
  // `ownsCoverageNote: true` so WidgetRenderer skips the auto-footer that
  // would otherwise stack on top of this one.
  if (!reliable) {
    return (
      <>
        <StatWidget value="--" />
        <CoverageNote text={costEmptyReason(t, tools)} />
      </>
    );
  }
  const value = formatCost(t.total_estimated_cost_usd, 2);
  // daily_trends[].cost is populated by enrichDailyTrendsWithPricing and
  // null on days where cost is structurally unshowable (stale pricing, no
  // priced sessions that day). Treating null as 0 for the split matches the
  // total's own summation semantic — both halves get the same treatment so
  // the direction reflects behavior change, not null handling.
  // `deltaInvert` — less total spend reads as the improvement direction,
  // matching CostPerEditWidget so the color semantic stays consistent.
  const delta = splitPeriodDelta(analytics.daily_trends, (d) => d.cost ?? 0);
  const ariaDelta = deltaAriaSuffix(delta);
  // Populated state paints ONLY load-bearing degradation reasons (stale
  // pricing, unpriced models). Cockpit stat cards stay bare; partial-
  // capture lives on a dedicated data-quality surface.
  const degraded = costDegradedReason(t);
  return (
    <>
      <StatWidget
        value={value}
        delta={delta}
        deltaInvert
        deltaFormat="usd"
        onOpenDetail={openUsage('cost')}
        detailAriaLabel={`Open usage detail · ${value} cost${ariaDelta}`}
      />
      <CoverageNote text={degraded} />
    </>
  );
}

function CostPerEditWidget({ analytics }: WidgetBodyProps) {
  const t = analytics.token_usage;
  // Lock-step with CostWidget: cost-per-edit is the numerator's ratio, so
  // whenever cost itself isn't showable, the ratio isn't either. Prevents
  // the "total says -- but the ratio shows a number" divergence.
  const reliable = hasCostData(t) && t.cost_per_edit != null;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  if (!reliable) {
    return (
      <>
        <StatWidget value="--" />
        <CoverageNote text={costEmptyReason(t, tools)} />
      </>
    );
  }
  const value = formatCost(t.cost_per_edit, 3);
  // Period-over-period delta. Both windows are priced against the current
  // snapshot (via enrichPeriodComparisonCost) so the arrow reflects
  // behavior change, not price drift. `deltaInvert` renders a downward
  // move green — cheaper is the improvement direction here. Structurally
  // null at 30-day windows (previous is outside retention) and at any
  // window where either side has no priced token data; StatWidget's delta
  // gate then suppresses the pill without the widget needing to know why.
  const pc = analytics.period_comparison;
  const delta = pc
    ? {
        current: pc.current.cost_per_edit,
        previous: pc.previous?.cost_per_edit ?? null,
      }
    : null;
  const degraded = costDegradedReason(t);
  return (
    <>
      <StatWidget
        value={value}
        delta={delta}
        deltaInvert
        deltaFormat="usd-fine"
        onOpenDetail={() => navigateToDetail('usage', 'cost', 'per-edit')}
        detailAriaLabel={`Open usage detail · ${value} per edit`}
      />
      <CoverageNote text={degraded} />
    </>
  );
}

function ProjectsWidget({ summaries, liveAgents }: WidgetBodyProps) {
  if (summaries.length === 0) return <SectionEmpty>No projects</SectionEmpty>;

  return (
    <div className={projectsStyles.projectsTable}>
      <div className={projectsStyles.projectsTableHeader}>
        <span>Project</span>
        <span>Tools</span>
        <span>Activity</span>
        <span className={projectsStyles.projectsHeaderNum}>Memories</span>
        <span className={projectsStyles.projectsHeaderNum}>Conflicts</span>
        <span aria-hidden="true" />
      </div>
      <div className={projectsStyles.projectsTableBody}>
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
              className={projectsStyles.projectsTableRow}
              style={{ '--row-index': i } as CSSProperties}
              onClick={() => navigateToDetail('usage', 'projects', 'overview')}
              aria-label={`Open projects detail for ${teamName}`}
            >
              <span className={projectsStyles.projectsName}>{teamName}</span>

              <span className={projectsStyles.projectsCell}>
                {visibleTools.length === 0 ? (
                  <span className={projectsStyles.projectsEmpty}>—</span>
                ) : (
                  <span className={projectsStyles.projectsTools}>
                    {visibleTools.map((t) => {
                      const isLive = liveTools.has(t.host_tool);
                      const meta = getToolMeta(t.host_tool);
                      return (
                        <span
                          key={t.host_tool}
                          className={isLive ? projectsStyles.toolLive : projectsStyles.toolIdle}
                          title={isLive ? `${meta.label} (active)` : meta.label}
                        >
                          <ToolIcon tool={t.host_tool} size={16} />
                        </span>
                      );
                    })}
                    {overflow > 0 && (
                      <span className={projectsStyles.toolOverflow}>+{overflow}</span>
                    )}
                  </span>
                )}
              </span>

              <span
                className={projectsStyles.projectsActivityCell}
                title="Daily sessions over the last 7 days"
              >
                {daily && daily.length >= 2 ? (
                  <Sparkline values={daily} height={20} endDot />
                ) : (
                  <span className={projectsStyles.projectsEmptyNum}>—</span>
                )}
              </span>

              <span className={projectsStyles.projectsNumCell}>
                <span className={projectsStyles.projectsNumValue}>
                  {memoryCount.toLocaleString()}
                </span>
                {memoryDelta != null && memoryDelta !== 0 && <InlineDelta value={memoryDelta} />}
              </span>

              <span className={projectsStyles.projectsNumCell}>
                {conflicts7d != null ? (
                  <>
                    <span className={projectsStyles.projectsNumValue}>
                      {conflicts7d.toLocaleString()}
                    </span>
                    {conflictsDelta != null && conflictsDelta !== 0 && (
                      <InlineDelta value={conflictsDelta} invert />
                    )}
                  </>
                ) : (
                  <span className={projectsStyles.projectsEmptyNum}>—</span>
                )}
              </span>

              <span className={projectsStyles.projectsViewButton}>View</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const usageWidgets: WidgetRegistry = {
  sessions: SessionsWidget,
  edits: EditsWidget,
  'lines-added': LinesAddedWidget,
  'lines-removed': LinesRemovedWidget,
  'files-touched': FilesTouchedWidget,
  cost: CostWidget,
  'cost-per-edit': CostPerEditWidget,
  projects: ProjectsWidget,
};
