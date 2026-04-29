import { useMemo } from 'react';

import { DetailView, type DetailTabDef } from '../../../components/DetailView/index.js';
import RangePills from '../../../components/RangePills/RangePills.jsx';
import { useTabs } from '../../../hooks/useTabs.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';

import { RANGES, formatScope, type RangeDays } from '../overview-utils.js';
import { MISSING_DELTA } from '../detailDelta.js';

import { fmtCount } from './format.js';
import { HealthPanel } from './panels/HealthPanel.js';
import { FreshnessPanel } from './panels/FreshnessPanel.js';
import { CrossToolPanel } from './panels/CrossToolPanel.js';
import { AuthorshipPanel } from './panels/AuthorshipPanel.js';
import { HygienePanel } from './panels/HygienePanel.js';

/* MemoryDetailView, the substrate-axis on living team memory.
 *
 *   health     total live memories, search-completion correlation,
 *              secrets shield, top-read memories
 *   freshness  aging composition, accumulating-vs-replacing read
 *   cross-tool author-consumer tool flow, category mix (catalog-only)
 *   authorship single-author directory concentration, category mix
 *   hygiene    supersession counters, category leaderboard
 *
 * Most tab deltas are MISSING_DELTA by design. Only `period` scope
 * responds to the picker, and even there the schema lacks a
 * previous-period comparator for cross-tool flow today. */

const MEMORY_TABS = ['health', 'freshness', 'cross-tool', 'authorship', 'hygiene'] as const;
type MemoryTab = (typeof MEMORY_TABS)[number];

function isMemoryTab(value: string | null | undefined): value is MemoryTab {
  return (MEMORY_TABS as readonly string[]).includes(value ?? '');
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

function freshShareUnder30d(a: UserAnalytics['memory_aging']): number {
  const total = a.recent_7d + a.recent_30d + a.recent_90d + a.older;
  if (total <= 0) return 0;
  return Math.round(((a.recent_7d + a.recent_30d) / total) * 100);
}

export default function MemoryDetailView({
  analytics,
  initialTab,
  onBack,
  rangeDays,
  onRangeChange,
  backLabel = 'Overview',
}: Props) {
  const resolved: MemoryTab = isMemoryTab(initialTab) ? initialTab : 'health';
  const tabControl = useTabs(MEMORY_TABS, resolved);
  const { activeTab } = tabControl;

  const m = analytics.memory_usage;
  const aging = analytics.memory_aging;
  const flow = analytics.cross_tool_memory_flow;
  const dirs = analytics.memory_single_author_directories;
  const sup = analytics.memory_supersession;

  const distinctPairs = useMemo(() => {
    const set = new Set<string>();
    for (const f of flow) {
      if (f.memories_read > 0) set.add(`${f.author_tool}|${f.consumer_tool}`);
    }
    return set.size;
  }, [flow]);

  const tabs: Array<DetailTabDef<MemoryTab>> = [
    {
      id: 'health',
      label: 'Health',
      value: m.total_memories > 0 ? fmtCount(m.total_memories) : '--',
      delta: { ...MISSING_DELTA },
    },
    {
      id: 'freshness',
      label: 'Freshness',
      value:
        aging.recent_7d + aging.recent_30d + aging.recent_90d + aging.older > 0
          ? `${freshShareUnder30d(aging)}%`
          : '--',
      delta: { ...MISSING_DELTA },
    },
    {
      id: 'cross-tool',
      label: 'Cross-tool',
      value: distinctPairs > 0 ? fmtCount(distinctPairs) : '--',
      delta: { ...MISSING_DELTA },
    },
    {
      id: 'authorship',
      label: 'Authorship',
      value: dirs.length > 0 ? fmtCount(dirs.length) : '--',
      delta: { ...MISSING_DELTA },
    },
    {
      id: 'hygiene',
      label: 'Hygiene',
      value: sup.pending_proposals > 0 ? fmtCount(sup.pending_proposals) : '--',
      delta: { ...MISSING_DELTA },
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
      title="memory"
      subtitle={scopeSubtitle}
      actions={<RangePills value={rangeDays} onChange={onRangeChange} options={RANGES} />}
      tabs={tabs}
      tabControl={tabControl}
      idPrefix="memory"
      tablistLabel="Memory sections"
    >
      {activeTab === 'health' && <HealthPanel analytics={analytics} />}
      {activeTab === 'freshness' && <FreshnessPanel analytics={analytics} />}
      {activeTab === 'cross-tool' && <CrossToolPanel analytics={analytics} />}
      {activeTab === 'authorship' && <AuthorshipPanel analytics={analytics} />}
      {activeTab === 'hygiene' && <HygienePanel analytics={analytics} />}
    </DetailView>
  );
}
