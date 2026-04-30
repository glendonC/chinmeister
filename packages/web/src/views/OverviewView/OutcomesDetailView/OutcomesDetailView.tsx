import { useMemo } from 'react';

import { DetailView, type DetailTabDef } from '../../../components/DetailView/index.js';
import RangePills from '../../../components/RangePills/RangePills.jsx';
import { useTabs } from '../../../hooks/useTabs.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';

import { RANGES, formatScope, type RangeDays } from '../overview-utils.js';
import { MISSING_DELTA, formatRateDelta } from '../detailDelta.js';

import { fmtCount } from './format.js';
import { SessionsPanel } from './panels/SessionsPanel.js';
import { RetriesPanel } from './panels/RetriesPanel.js';
import { WorkTypesPanel } from './panels/WorkTypesPanel.js';

/* OutcomesDetailView, "did the work land" at scale.
 *
 * Mirrors the UsageDetailView structure (DetailView shell, DetailSection
 * blocks, tab-driven panels) but answers a different question family:
 *
 *   sessions   - completion health and stall behavior
 *   retries    - difficulty: one-shot rate and scope completion scale
 *   types      - work-type completion bars
 *
 * First-edit latency and duration shape live in UsageDetailView; they are
 * about cadence and pacing, not about whether work landed. */

const OUTCOMES_TABS = ['sessions', 'retries', 'types'] as const;
type OutcomesTab = (typeof OUTCOMES_TABS)[number];

function isOutcomesTab(value: string | null | undefined): value is OutcomesTab {
  return (OUTCOMES_TABS as readonly string[]).includes(value ?? '');
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

export default function OutcomesDetailView({
  analytics,
  initialTab,
  onBack,
  rangeDays,
  onRangeChange,
  backLabel = 'Overview',
}: Props) {
  const resolved: OutcomesTab = isOutcomesTab(initialTab) ? initialTab : 'sessions';
  const tabControl = useTabs(OUTCOMES_TABS, resolved);
  const { activeTab } = tabControl;

  const cs = analytics.completion_summary;
  const oneShot = analytics.tool_call_stats;
  const pc = analytics.period_comparison;

  // Tabs whose value is a scalar quantity over the period MUST set a real delta
  // via splitDelta+formatCountDelta / formatRateDelta / formatUsdDelta.
  // Categorical or structural tab values use MISSING_DELTA with a one-line rationale comment.
  const tabs: Array<DetailTabDef<OutcomesTab>> = [
    {
      id: 'sessions',
      label: 'Completion',
      value: cs.total_sessions > 0 ? `${Math.round(cs.completion_rate)}%` : '--',
      delta: formatRateDelta(cs.completion_rate, pc.previous?.completion_rate),
    },
    {
      id: 'retries',
      label: 'Difficulty',
      value: oneShot.one_shot_sessions > 0 ? `${oneShot.one_shot_rate}%` : '--',
      delta: formatRateDelta(oneShot.one_shot_rate, pc.previous?.one_shot_rate ?? null),
    },
    {
      id: 'types',
      label: 'By work type',
      value: fmtCount(analytics.work_type_outcomes.length),
      // rationale: tab value is count of distinct work-type categories, not period-additive.
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
      title="outcomes"
      subtitle={scopeSubtitle}
      actions={<RangePills value={rangeDays} onChange={onRangeChange} options={RANGES} />}
      tabs={tabs}
      tabControl={tabControl}
      idPrefix="outcomes"
      tablistLabel="Outcomes sections"
    >
      {activeTab === 'sessions' && <SessionsPanel analytics={analytics} />}
      {activeTab === 'retries' && <RetriesPanel analytics={analytics} />}
      {activeTab === 'types' && <WorkTypesPanel analytics={analytics} />}
    </DetailView>
  );
}
