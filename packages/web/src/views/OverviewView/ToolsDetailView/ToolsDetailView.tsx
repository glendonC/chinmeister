import { useMemo } from 'react';

import { DetailView, type DetailTabDef } from '../../../components/DetailView/index.js';
import RangePills from '../../../components/RangePills/RangePills.jsx';
import { useTabs } from '../../../hooks/useTabs.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';
import { useQueryParam } from '../../../lib/router.js';
import { getToolMeta } from '../../../lib/toolMeta.js';

import { RANGES, formatScope, type RangeDays } from '../overview-utils.js';
import { MISSING_DELTA, formatCountDelta, splitDelta } from '../detailDelta.js';

import { fmtCount } from './format.js';
import { ToolsPanel } from './panels/ToolsPanel.js';
import { FlowPanel } from './panels/FlowPanel.js';
import { ErrorsPanel } from './panels/ErrorsPanel.js';

/* ToolsDetailView, the coordination axis on cross-tool agent activity.
 *
 * Companion to UsageDetailView (volume), OutcomesDetailView (did-it-land),
 * ActivityDetailView (when/what), CodebaseDetailView (where in the code).
 * Tools asks WHERE work flows across tools and where it gets stuck.
 *
 *   tools  - coverage matrix, workload, models (per-tool brand attribution)
 *   flow   - handoff pairs, gap (cross-tool latency)
 *   errors - top errors by tool, recent errors timeline, token costs
 *
 * Q3 of flow (handoff completion vs single-tool baseline) is intentionally
 * absent because it is Simpson's-paradox-adjacent. Models is a
 * sub-question of Tools rather than its own tab: promoting it multiplies
 * the model-ranking surface area without the work-type filter affordance
 * that would mitigate it. */

const TOOLS_TABS = ['tools', 'flow', 'errors'] as const;
type ToolsTab = (typeof TOOLS_TABS)[number];

function isToolsTab(value: string | null | undefined): value is ToolsTab {
  return (TOOLS_TABS as readonly string[]).includes(value ?? '');
}

interface Props {
  analytics: UserAnalytics;
  initialTab?: string | null;
  onBack: () => void;
  rangeDays: RangeDays;
  onRangeChange: (next: RangeDays) => void;
  // Label for the back chevron. "Overview" on the cross-project surface,
  // "Project" when ProjectView mounts the same detail. Default keeps
  // existing OverviewView call sites unchanged.
  backLabel?: string;
}

export default function ToolsDetailView({
  analytics,
  initialTab,
  onBack,
  rangeDays,
  onRangeChange,
  backLabel = 'Overview',
}: Props) {
  const resolved: ToolsTab = isToolsTab(initialTab) ? initialTab : 'tools';
  const tabControl = useTabs(TOOLS_TABS, resolved);
  const { activeTab } = tabControl;

  const tools = analytics.tool_comparison;
  const handoffs = analytics.tool_handoffs;
  const errs = analytics.tool_call_stats.error_patterns;
  const callStats = analytics.tool_call_stats;
  const dailyTrends = analytics.daily_trends;

  // Panel-scope tool filter, lives in the URL via `?tool=<host_tool>`.
  // Read at the parent so the tools-tab value can reflect the focused tool.
  const toolFilter = useQueryParam('tool');
  const focusedTool = toolFilter ? (tools.find((t) => t.host_tool === toolFilter) ?? null) : null;

  const activeTools = useMemo(() => tools.filter((t) => t.sessions > 0), [tools]);
  const totalEdges = handoffs.length;
  const totalErrors = errs.reduce((s, e) => s + e.count, 0);

  // Tabs whose value is a scalar quantity over the period MUST set a real delta
  // via splitDelta+formatCountDelta / formatRateDelta / formatUsdDelta.
  // Categorical or structural tab values use MISSING_DELTA with a one-line rationale comment.
  const tabs: Array<DetailTabDef<ToolsTab>> = [
    {
      id: 'tools',
      label: 'Tools',
      value: focusedTool
        ? getToolMeta(focusedTool.host_tool).label
        : activeTools.length > 0
          ? fmtCount(activeTools.length)
          : '--',
      // rationale: tab value is either a count of distinct categories (tools) or a
      // single focused tool's name; neither is period-additive.
      delta: MISSING_DELTA,
    },
    {
      id: 'flow',
      label: 'Flow',
      value: totalEdges > 0 ? fmtCount(totalEdges) : '--',
      // rationale: tab value is count of distinct categories (handoff edges), not period-additive.
      delta: MISSING_DELTA,
    },
    {
      id: 'errors',
      label: 'Errors',
      value: totalErrors > 0 ? fmtCount(totalErrors) : '--',
      delta: formatCountDelta(splitDelta(dailyTrends, (d) => d.errors)),
    },
  ];

  const scopeSubtitle = useMemo(() => {
    return (
      formatScope([
        { count: activeTools.length, singular: 'tool' },
        { count: analytics.teams_included, singular: 'project' },
      ]) || undefined
    );
  }, [activeTools.length, analytics.teams_included]);

  return (
    <DetailView
      backLabel={backLabel}
      onBack={onBack}
      title="tools"
      subtitle={scopeSubtitle}
      actions={<RangePills value={rangeDays} onChange={onRangeChange} options={RANGES} />}
      tabs={tabs}
      tabControl={tabControl}
      idPrefix="tools"
      tablistLabel="Tools sections"
    >
      {activeTab === 'tools' && <ToolsPanel analytics={analytics} />}
      {activeTab === 'flow' && <FlowPanel analytics={analytics} />}
      {activeTab === 'errors' && <ErrorsPanel analytics={analytics} callStats={callStats} />}
    </DetailView>
  );
}
