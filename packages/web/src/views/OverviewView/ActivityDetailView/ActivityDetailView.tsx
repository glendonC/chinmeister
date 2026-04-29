import { useMemo } from 'react';

import { DetailView, type DetailTabDef } from '../../../components/DetailView/index.js';
import RangePills from '../../../components/RangePills/RangePills.jsx';
import { useTabs } from '../../../hooks/useTabs.js';
import { qualifyByVolume } from '../../../lib/qualifyByVolume.js';
import { DAY_LABELS } from '../../../widgets/utils.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';

import { RANGES, formatScope, type RangeDays } from '../overview-utils.js';
import { MISSING_DELTA } from '../detailDelta.js';

import { hourGlyph } from './format.js';
import { RhythmPanel } from './panels/RhythmPanel.js';
import { MixPanel } from './panels/MixPanel.js';
import { EffectiveHoursPanel } from './panels/EffectiveHoursPanel.js';

/* ActivityDetailView, the temporal/categorical lens on activity.
 *
 * Companion to UsageDetailView (volume scale) and OutcomesDetailView
 * (did-it-land). Activity asks WHEN sessions happen and WHAT KIND of
 * work fills them. Three tabs:
 *
 *   rhythm           - peak hour, weekday vs weekend, time-of-day blocks
 *   mix              - work-type share, lines added/removed, files spread
 *   effective-hours  - per-hour completion rate gated to hours with
 *                      >= p25 volume so off-hour bursts don't lie
 *
 * The synthesizer's pre-pass cut Q2 of effective-hours (volume vs rate
 * Pearson correlation), stats vocabulary in user copy is a B1 risk.
 * Tab carries on with peak-completion + dow-dip.
 */

const ACTIVITY_TABS = ['rhythm', 'mix', 'effective-hours'] as const;
type ActivityTab = (typeof ACTIVITY_TABS)[number];

function isActivityTab(value: string | null | undefined): value is ActivityTab {
  return (ACTIVITY_TABS as readonly string[]).includes(value ?? '');
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

// Compute the largest slice of work_type_distribution by edits, used
// for the mix tab's tab-strip value. Returns null when there are no
// edits in the window so the tab can render `--`.
function largestWorkType(
  workTypes: UserAnalytics['work_type_distribution'],
): { work_type: string; share: number } | null {
  const totalEdits = workTypes.reduce((s, w) => s + w.edits, 0);
  if (totalEdits === 0) return null;
  const top = [...workTypes].sort((a, b) => b.edits - a.edits)[0];
  if (!top) return null;
  return { work_type: top.work_type, share: (top.edits / totalEdits) * 100 };
}

export default function ActivityDetailView({
  analytics,
  initialTab,
  onBack,
  rangeDays,
  onRangeChange,
  backLabel = 'Overview',
}: Props) {
  const resolved: ActivityTab = isActivityTab(initialTab) ? initialTab : 'rhythm';
  const tabControl = useTabs(ACTIVITY_TABS, resolved);
  const { activeTab } = tabControl;

  // Peak hour = the (dow, hour) cell with the highest sessions count.
  // Used for the rhythm tab's value caption; falls back to `--` when no
  // sessions are populated yet.
  const peakCell = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const h of analytics.hourly_distribution) {
      grid[h.dow][h.hour] = (grid[h.dow][h.hour] || 0) + h.sessions;
    }
    let best: { dow: number; hour: number; sessions: number } | null = null;
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const v = grid[dow][hour];
        if (v > 0 && (best === null || v > best.sessions)) {
          best = { dow, hour, sessions: v };
        }
      }
    }
    return best;
  }, [analytics.hourly_distribution]);

  const topWorkType = useMemo(
    () => largestWorkType(analytics.work_type_distribution),
    [analytics.work_type_distribution],
  );

  // Effective-hours qualified set: hours with sessions >= p25 of populated.
  // Used both for the tab value (median completion across qualifying
  // hours) and for the peak-completion question's bar chart.
  const qualifiedHours = useMemo(() => {
    const populated = analytics.hourly_effectiveness.filter((h) => h.sessions > 0);
    return qualifyByVolume(populated, (h) => h.sessions, 25);
  }, [analytics.hourly_effectiveness]);

  const medianCompletion = useMemo(() => {
    if (qualifiedHours.length === 0) return null;
    const rates = [...qualifiedHours].map((h) => h.completion_rate).sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    return rates.length % 2 === 0 ? Math.round((rates[mid - 1] + rates[mid]) / 2) : rates[mid];
  }, [qualifiedHours]);

  const tabs: Array<DetailTabDef<ActivityTab>> = [
    {
      id: 'rhythm',
      label: 'When',
      value: peakCell ? `${DAY_LABELS[peakCell.dow]} ${hourGlyph(peakCell.hour)}` : '--',
      delta: MISSING_DELTA,
    },
    {
      id: 'mix',
      label: 'Work mix',
      value: topWorkType ? `${topWorkType.work_type} ${Math.round(topWorkType.share)}%` : '--',
      delta: MISSING_DELTA,
    },
    {
      id: 'effective-hours',
      label: 'Effective hours',
      value: medianCompletion != null ? `${medianCompletion}%` : '--',
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
      title="activity"
      subtitle={scopeSubtitle}
      actions={<RangePills value={rangeDays} onChange={onRangeChange} options={RANGES} />}
      tabs={tabs}
      tabControl={tabControl}
      idPrefix="activity"
      tablistLabel="Activity sections"
    >
      {activeTab === 'rhythm' && <RhythmPanel analytics={analytics} peakCell={peakCell} />}
      {activeTab === 'mix' && <MixPanel analytics={analytics} />}
      {activeTab === 'effective-hours' && (
        <EffectiveHoursPanel analytics={analytics} qualifiedHours={qualifiedHours} />
      )}
    </DetailView>
  );
}
