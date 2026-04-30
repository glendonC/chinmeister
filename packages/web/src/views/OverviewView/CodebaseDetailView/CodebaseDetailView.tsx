import { useMemo } from 'react';

import { DetailView, type DetailTabDef } from '../../../components/DetailView/index.js';
import RangePills from '../../../components/RangePills/RangePills.jsx';
import { useTabs } from '../../../hooks/useTabs.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';

import { RANGES, formatScope, type RangeDays } from '../overview-utils.js';
import { MISSING_DELTA, formatCountDelta, splitDelta } from '../detailDelta.js';

import { fmtCount } from './format.js';
import { LandscapePanel } from './panels/LandscapePanel.js';
import { DirectoriesPanel } from './panels/DirectoriesPanel.js';
import { RiskPanel } from './panels/RiskPanel.js';
import { CommitsPanel } from './panels/CommitsPanel.js';

/* CodebaseDetailView, the file/directory axis on cross-tool agent activity.
 *
 * Companion to UsageDetailView (volume), OutcomesDetailView (did-it-land),
 * and ActivityDetailView (when/what kind). Codebase asks WHERE in the
 * code agents are working and what's drifting.
 *
 *   landscape    - treemap, completion-by-file constellation, churn shape
 *   directories  - top dirs columns, constellation, cold-dir staleness
 *   risk         - failing-files (rework x heatmap), collisions
 *   commits      - headline, per-tool, daily, vs completion
 *
 * The synthesizer's pre-pass cut Q3 of risk (daily-risk Simpson's-paradox
 * adjacency); tab carries on Q1+Q2 alone. */

const CODEBASE_TABS = ['landscape', 'directories', 'risk', 'commits'] as const;
type CodebaseTab = (typeof CODEBASE_TABS)[number];

function isCodebaseTab(value: string | null | undefined): value is CodebaseTab {
  return (CODEBASE_TABS as readonly string[]).includes(value ?? '');
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

export default function CodebaseDetailView({
  analytics,
  initialTab,
  onBack,
  rangeDays,
  onRangeChange,
  backLabel = 'Overview',
}: Props) {
  const resolved: CodebaseTab = isCodebaseTab(initialTab) ? initialTab : 'landscape';
  const tabControl = useTabs(CODEBASE_TABS, resolved);
  const { activeTab } = tabControl;

  const filesTouched = analytics.files_touched_total;
  const dirCount = analytics.directory_heatmap.length;
  const reworkCount = analytics.file_rework.length;
  const cs = analytics.commit_stats;

  // Files-touched proxy delta on daily edits, files_touched_total is a
  // distinct-count and not additive across days, so the spec defers to
  // the edits proxy. When daily_trends has fewer than 2 days populated
  // the delta falls back to em-dash.
  const filesTouchedDelta = useMemo(
    () => formatCountDelta(splitDelta(analytics.daily_trends, (d) => d.edits)),
    [analytics.daily_trends],
  );

  const commitDelta = useMemo(
    () => formatCountDelta(splitDelta(cs.daily_commits, (d) => d.commits)),
    [cs.daily_commits],
  );

  // Tabs whose value is a scalar quantity over the period MUST set a real delta
  // via splitDelta+formatCountDelta / formatRateDelta / formatUsdDelta.
  // Categorical or structural tab values use MISSING_DELTA with a one-line rationale comment.
  const tabs: Array<DetailTabDef<CodebaseTab>> = [
    {
      id: 'landscape',
      label: 'Landscape',
      value: filesTouched > 0 ? `${fmtCount(filesTouched)} files` : '--',
      delta: filesTouchedDelta,
    },
    {
      id: 'directories',
      label: 'Directories',
      value: dirCount > 0 ? `${fmtCount(dirCount)} dirs` : '--',
      // rationale: tab value is count of distinct directories, not period-additive.
      delta: MISSING_DELTA,
    },
    {
      id: 'risk',
      label: 'Risk',
      value: reworkCount > 0 ? `${fmtCount(reworkCount)} files` : '--',
      // rationale: tab value is count of distinct categories (files at risk), not period-additive.
      delta: MISSING_DELTA,
    },
    {
      id: 'commits',
      label: 'Commits',
      value: cs.total_commits > 0 ? fmtCount(cs.total_commits) : '--',
      delta: commitDelta,
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
      title="codebase"
      subtitle={scopeSubtitle}
      actions={<RangePills value={rangeDays} onChange={onRangeChange} options={RANGES} />}
      tabs={tabs}
      tabControl={tabControl}
      idPrefix="codebase"
      tablistLabel="Codebase sections"
    >
      {activeTab === 'landscape' && <LandscapePanel analytics={analytics} />}
      {activeTab === 'directories' && <DirectoriesPanel analytics={analytics} />}
      {activeTab === 'risk' && <RiskPanel analytics={analytics} />}
      {activeTab === 'commits' && <CommitsPanel analytics={analytics} />}
    </DetailView>
  );
}
