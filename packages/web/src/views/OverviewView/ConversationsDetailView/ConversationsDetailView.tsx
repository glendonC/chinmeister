import { useMemo } from 'react';

import { DetailView, type DetailTabDef } from '../../../components/DetailView/index.js';
import RangePills from '../../../components/RangePills/RangePills.jsx';
import { useTabs } from '../../../hooks/useTabs.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';

import { RANGES, formatScope, type RangeDays } from '../overview-utils.js';
import { MISSING_DELTA } from '../detailDelta.js';
import { fmtCount } from '../UsageDetailView/format.js';

import { SignalsPanel } from './panels/SignalsPanel.js';

const CONVERSATION_TABS = ['signals'] as const;
type ConversationTab = (typeof CONVERSATION_TABS)[number];

function isConversationTab(value: string | null | undefined): value is ConversationTab {
  return value === 'signals';
}

interface Props {
  analytics: UserAnalytics;
  initialTab?: string | null;
  onBack: () => void;
  rangeDays: RangeDays;
  onRangeChange: (next: RangeDays) => void;
  backLabel?: string;
}

export default function ConversationsDetailView({
  analytics,
  initialTab,
  onBack,
  rangeDays,
  onRangeChange,
  backLabel = 'Overview',
}: Props) {
  const resolved: ConversationTab = isConversationTab(initialTab) ? initialTab : 'signals';
  const tabControl = useTabs(CONVERSATION_TABS, resolved);

  const signalCount =
    analytics.confused_files.length +
    analytics.cross_tool_handoff_questions.length +
    analytics.unanswered_questions.count;

  const tabs: Array<DetailTabDef<ConversationTab>> = [
    {
      id: 'signals',
      label: 'Signals',
      value: signalCount > 0 ? fmtCount(signalCount) : '--',
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
      title="conversations"
      subtitle={scopeSubtitle}
      actions={<RangePills value={rangeDays} onChange={onRangeChange} options={RANGES} />}
      tabs={tabs}
      tabControl={tabControl}
      idPrefix="conversations"
      tablistLabel="Conversation sections"
    >
      <SignalsPanel analytics={analytics} />
    </DetailView>
  );
}
