import { useMemo, type ReactNode } from 'react';
import { DetailView, type DetailTabDef } from '../../../components/DetailView/index.js';
import RangePills from '../../../components/RangePills/RangePills.jsx';
import { useTabs } from '../../../hooks/useTabs.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';
import { formatCost } from '../../../widgets/utils.js';
import { hasCostData } from '../../../widgets/bodies/shared.js';
import { RANGES, formatScope, type RangeDays } from '../overview-utils.js';
import { fmtCount, MISSING_DELTA, splitDelta, formatCountDelta, formatUsdDelta } from './shared.js';
import SessionsPanel from './SessionsPanel.js';
import EditsPanel from './EditsPanel.js';
import LinesPanel from './LinesPanel.js';
import CostPanel from './CostPanel.js';
import CostPerEditPanel from './CostPerEditPanel.js';
import FilesTouchedPanel from './FilesTouchedPanel.js';

const USAGE_TABS = [
  'sessions',
  'edits',
  'lines',
  'cost',
  'cost-per-edit',
  'files-touched',
] as const;
type UsageTab = (typeof USAGE_TABS)[number];

function isUsageTab(value: string | null | undefined): value is UsageTab {
  return (USAGE_TABS as readonly string[]).includes(value ?? '');
}

interface Props {
  analytics: UserAnalytics;
  initialTab?: string | null;
  onBack: () => void;
  rangeDays: RangeDays;
  onRangeChange: (next: RangeDays) => void;
  /** Label for the back button. Defaults to "Overview" so existing callers
   *  are unchanged; project-hosted drills pass "Project". */
  backLabel?: string;
  /** Host-provided scope control rendered in the header actions row before
   *  the range pills. Overview slots in its ProjectFilter so mid-drill
   *  filter changes refetch in place; Project slots in a scope-up link
   *  that navigates to the same drill at cross-project scope. Omit to
   *  render only the range pills. */
  scopeControl?: ReactNode;
}

export default function UsageDetailView({
  analytics,
  initialTab,
  onBack,
  rangeDays,
  onRangeChange,
  backLabel = 'Overview',
  scopeControl,
}: Props) {
  const totals = useMemo(() => {
    const sessions = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
    const edits = analytics.daily_trends.reduce((s, d) => s + d.edits, 0);
    const linesAdded = analytics.daily_trends.reduce((s, d) => s + d.lines_added, 0);
    const linesRemoved = analytics.daily_trends.reduce((s, d) => s + d.lines_removed, 0);
    const linesNet = linesAdded - linesRemoved;
    const cost = analytics.token_usage.total_estimated_cost_usd;
    const cpe = analytics.token_usage.cost_per_edit;
    const filesTouched = analytics.files_touched_total;
    return { sessions, edits, linesAdded, linesRemoved, linesNet, cost, cpe, filesTouched };
  }, [analytics]);

  const resolvedInitialTab: UsageTab = isUsageTab(initialTab) ? initialTab : 'sessions';
  const tabControl = useTabs(USAGE_TABS, resolvedInitialTab);
  const { activeTab } = tabControl;

  // Tab value for lines is the net signed delta — "+647" or "−120" reads
  // "did the codebase grow or shrink in this window". Total churn
  // (added + removed) also makes sense as a scalar but doesn't answer the
  // at-a-glance question the hero stats in the panel carry; net is the
  // decision-relevant summary for a tab header.
  const linesTabValue =
    totals.linesAdded === 0 && totals.linesRemoved === 0
      ? '--'
      : `${totals.linesNet >= 0 ? '+' : '−'}${fmtCount(Math.abs(totals.linesNet))}`;

  // Tab deltas mirror the overview KPI widgets one-for-one so the same
  // metric can't show two different numbers between views. Sources match
  // each widget's choice in `widgets/bodies/UsageWidgets.tsx`:
  //   - Sessions / Edits / Lines: in-window split (avoids 30-day retention
  //     emptying period_comparison.previous in production)
  //   - Cost: in-window split on daily_trends.cost (the per-day cost is
  //     already pricing-enriched server-side)
  //   - Cost / edit: period_comparison.cost_per_edit + invert (matches the
  //     CostPerEditWidget exactly; null at 30-day windows by design)
  //   - Files: no per-day breakdown exists yet; placeholder em-dash
  const trends = analytics.daily_trends;
  const pc = analytics.period_comparison;

  const tabs: Array<DetailTabDef<UsageTab>> = [
    {
      id: 'sessions',
      label: 'Sessions',
      value: fmtCount(totals.sessions),
      delta: formatCountDelta(splitDelta(trends, (d) => d.sessions)),
    },
    {
      id: 'edits',
      label: 'Edits',
      value: fmtCount(totals.edits),
      delta: formatCountDelta(splitDelta(trends, (d) => d.edits)),
    },
    {
      id: 'lines',
      label: 'Lines',
      value: linesTabValue,
      delta: formatCountDelta(splitDelta(trends, (d) => d.lines_added - d.lines_removed)),
    },
    {
      id: 'cost',
      label: 'Cost',
      value: hasCostData(analytics.token_usage) ? formatCost(totals.cost, 2) : '--',
      delta: (() => {
        const s = splitDelta(trends, (d) => d.cost ?? 0);
        return formatUsdDelta(s?.current ?? null, s?.previous ?? null, 2);
      })(),
    },
    {
      id: 'cost-per-edit',
      label: 'Cost / edit',
      value:
        hasCostData(analytics.token_usage) && totals.cpe != null ? formatCost(totals.cpe, 3) : '--',
      delta: formatUsdDelta(pc.current.cost_per_edit, pc.previous?.cost_per_edit ?? null, 3, true),
    },
    {
      id: 'files-touched',
      label: 'Files',
      value: fmtCount(totals.filesTouched),
      delta: MISSING_DELTA,
    },
  ];

  const scopeSubtitle = useMemo(() => {
    const activeTools = analytics.tool_comparison.filter((t) => t.sessions > 0).length;
    return (
      formatScope([
        { count: activeTools, singular: 'tool' },
        { count: analytics.teams_included, singular: 'project' },
      ]) || undefined
    );
  }, [analytics]);

  return (
    <DetailView
      backLabel={backLabel}
      onBack={onBack}
      title="usage"
      subtitle={scopeSubtitle}
      actions={
        <>
          {scopeControl}
          <RangePills value={rangeDays} onChange={onRangeChange} options={RANGES} />
        </>
      }
      tabs={tabs}
      tabControl={tabControl}
      idPrefix="usage"
      tablistLabel="Usage sections"
    >
      {activeTab === 'sessions' && <SessionsPanel analytics={analytics} />}
      {activeTab === 'edits' && <EditsPanel analytics={analytics} />}
      {activeTab === 'lines' && <LinesPanel analytics={analytics} />}
      {activeTab === 'cost' && <CostPanel analytics={analytics} />}
      {activeTab === 'cost-per-edit' && <CostPerEditPanel analytics={analytics} />}
      {activeTab === 'files-touched' && <FilesTouchedPanel analytics={analytics} />}
    </DetailView>
  );
}
