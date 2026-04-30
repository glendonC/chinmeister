import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import clsx from 'clsx';
import { getToolMeta } from '../../lib/toolMeta.js';
import { formatDuration } from '../../lib/utils.js';
import {
  DetailView,
  FocusedDetailView,
  Metric,
  type DetailTabDef,
  type FocusedQuestion,
} from '../../components/DetailView/index.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.js';
import { useTabs } from '../../hooks/useTabs.js';
import { useQueryParam, setQueryParam } from '../../lib/router.js';
import type { LiveAgent } from '../../widgets/types.js';
import { groupFilesByTeam } from '../../widgets/live-data.js';
import type { Lock } from '../../lib/apiSchemas.js';
import { FileRow } from '../../widgets/bodies/LiveWidgets.js';
import widgetStyles from '../../widgets/bodies/LiveWidgets.module.css';
import { formatScope } from './overview-utils.js';
import styles from './LiveNowView.module.css';

// Mirrors the LiveWidgets editor-handle stale window: an agent whose
// heartbeat is older than this fades to signal "cooling off". Keeping
// the value identical to widgets/bodies/LiveWidgets.tsx STALE_AFTER_SECONDS
// so the surface and drill-in agree on which agents read as stale.
const STALE_AFTER_SECONDS = 30;

const LIVE_TABS = ['agents', 'conflicts', 'files'] as const;
type LiveTab = (typeof LIVE_TABS)[number];

function isLiveTab(value: string | null | undefined): value is LiveTab {
  return value === 'agents' || value === 'conflicts' || value === 'files';
}

interface Props {
  liveAgents: LiveAgent[];
  locks: Lock[];
  focusAgentId: string | null;
  initialTab?: string | null;
  onBack: () => void;
  onOpenProject: (teamId: string) => void;
  onOpenTools: () => void;
  // Label for the back chevron. "Overview" by default; ProjectView passes
  // "Project" when mounting this detail in a single-project context.
  backLabel?: string;
  // Scope phrasing used in the empty-state subtitle. Default reads
  // "across your projects" (cross-project surface). ProjectView passes
  // "in this project" so the empty state matches its scope.
  scopeLabel?: string;
}

export default function LiveNowView({
  liveAgents,
  locks,
  focusAgentId,
  initialTab,
  onBack,
  onOpenProject,
  backLabel = 'Overview',
  scopeLabel = 'across your projects',
}: Props) {
  const focusRowRef = useRef<HTMLButtonElement>(null);

  const fileGroups = useMemo(() => groupFilesByTeam(liveAgents), [liveAgents]);

  // Look-up used by FileRow to compute Status (claimed / unclaimed /
  // mismatch) and Duration per file. Same data path the widget uses so
  // the drill-in reads identical claim state.
  const locksByFile = useMemo(() => {
    const map = new Map<string, Lock>();
    for (const l of locks) map.set(l.file_path, l);
    return map;
  }, [locks]);

  const conflicts = useMemo(
    () =>
      fileGroups
        .filter((g) => g.agents.length > 1)
        .sort((a, b) => b.agents.length - a.agents.length),
    [fileGroups],
  );

  // The `claimed-files` widget body sets `q=by-claim-age` when it drills
  // into the Files tab so the user lands on the same sort order they were
  // reading from. Default sort (collisions desc) applies when the param
  // is absent. The lookup runs through locksByFile because the underlying
  // FileGroup record carries no claim age; minutes_held lives on Lock.
  const questionParam = useQueryParam('q');
  const filesInPlay = useMemo(() => {
    const groups = [...fileGroups];
    if (questionParam === 'by-claim-age') {
      return groups.sort((a, b) => {
        const am = locksByFile.get(a.file)?.minutes_held ?? 0;
        const bm = locksByFile.get(b.file)?.minutes_held ?? 0;
        if (bm !== am) return bm - am;
        return a.file.localeCompare(b.file);
      });
    }
    return groups.sort((a, b) => {
      if (b.agents.length !== a.agents.length) return b.agents.length - a.agents.length;
      return a.file.localeCompare(b.file);
    });
  }, [fileGroups, locksByFile, questionParam]);

  const totalAgents = liveAgents.length;
  const totalConflicts = conflicts.length;
  const totalFilesInPlay = fileGroups.length;

  // Open on the tab the drill-in requested (conflicts/files rows carry it
  // via ?live-tab). Agent rows don't set the param, so they default to the
  // Agents tab - which is also where the focus scroll belongs.
  const resolvedInitialTab: LiveTab = isLiveTab(initialTab)
    ? initialTab
    : focusAgentId
      ? 'agents'
      : 'agents';

  const tabControl = useTabs(LIVE_TABS, resolvedInitialTab);
  const { activeTab } = tabControl;

  // Auto-scroll the focused agent row into view when the view opens on the
  // agents tab. Gated on activeTab so switching to another tab doesn't
  // re-trigger the scroll jump.
  useEffect(() => {
    if (!focusAgentId || activeTab !== 'agents') return;
    const el = focusRowRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 260);
    return () => clearTimeout(t);
  }, [focusAgentId, activeTab]);

  if (totalAgents === 0) {
    return (
      <DetailView
        backLabel={backLabel}
        onBack={onBack}
        title="live"
        subtitle={`No one working right now ${scopeLabel}.`}
        tabs={[]}
        tabControl={tabControl}
        idPrefix="live"
        tablistLabel="Live sections"
      >
        <span />
      </DetailView>
    );
  }

  // One-line subtitle - shared formatScope keeps it in sync with Usage.
  const teamsRepresented = new Set(liveAgents.map((a) => a.teamId).filter(Boolean)).size;
  const liveSubtitle = formatScope([
    { count: totalAgents, singular: 'agent' },
    { count: totalConflicts, singular: 'conflict' },
    { count: totalFilesInPlay, singular: 'file in play', plural: 'files in play' },
    { count: teamsRepresented, singular: 'project' },
  ]);

  const tabs: Array<DetailTabDef<LiveTab>> = [
    {
      id: 'agents',
      label: 'Agents',
      value: totalAgents,
      ...(totalAgents > 0 ? { tone: 'accent' as const } : {}),
    },
    {
      id: 'conflicts',
      label: 'Conflicts',
      value: totalConflicts,
      ...(totalConflicts > 0 ? { tone: 'accent' as const } : {}),
    },
    {
      id: 'files',
      label: 'Files',
      value: totalFilesInPlay,
      ...(totalFilesInPlay > 0 ? { tone: 'accent' as const } : {}),
    },
  ];

  const focusedAgent = focusAgentId
    ? liveAgents.find((agent) => agent.agent_id === focusAgentId)
    : null;
  const activeTools = new Set(liveAgents.map((agent) => agent.host_tool)).size;
  const claimedFilesInPlay = filesInPlay.filter((group) => locksByFile.has(group.file));

  const agentsTable = (
    <div className={styles.agentsTable}>
      <div className={styles.agentsHeader}>
        <span>Member</span>
        <span>Tool</span>
        <span>Project</span>
        <span className={styles.numHeader}>Files</span>
        <span className={styles.numHeader}>Session</span>
        <span>Summary</span>
        <span aria-hidden="true" />
      </div>
      {liveAgents.map((a, i) => {
        const meta = getToolMeta(a.host_tool);
        const sessionLabel =
          a.session_minutes != null && a.session_minutes > 0
            ? formatDuration(a.session_minutes)
            : '-';
        const isFocused = a.agent_id === focusAgentId;
        const isStale = (a.seconds_since_update ?? 0) > STALE_AFTER_SECONDS;
        const summary = a.summary && a.summary.trim().length > 0 ? a.summary : null;
        return (
          <button
            ref={isFocused ? focusRowRef : undefined}
            key={a.agent_id}
            type="button"
            className={clsx(styles.agentsRow, isStale && styles.agentsRowStale)}
            style={{ '--row-index': i } as CSSProperties}
            onClick={() => setQueryParam('live', a.agent_id)}
          >
            <span className={styles.agentName} style={{ color: meta.color }}>
              {a.handle}
            </span>
            <span className={clsx(styles.agentCell, styles.agentCellTool)}>
              <ToolIcon tool={a.host_tool} size={16} />
              <span>{meta.label}</span>
            </span>
            <span className={styles.agentCell} title={a.teamName}>
              {a.teamName || '-'}
            </span>
            <span
              className={clsx(styles.agentCellNum, a.files.length === 0 && styles.agentCellMuted)}
            >
              {a.files.length}
            </span>
            <span
              className={clsx(styles.agentCellNum, sessionLabel === '-' && styles.agentCellMuted)}
            >
              {sessionLabel}
            </span>
            <span
              className={clsx(
                styles.agentCellSummary,
                summary == null && styles.agentCellSummaryNone,
              )}
              title={summary ?? undefined}
            >
              {summary ?? '-'}
            </span>
            <span className={styles.agentViewButton}>Focus</span>
          </button>
        );
      })}
    </div>
  );

  const renderFileTable = (groups: typeof filesInPlay, empty: string) =>
    groups.length === 0 ? (
      <span className={styles.empty}>{empty}</span>
    ) : (
      <div className={widgetStyles.conflictTable}>
        <div className={widgetStyles.conflictTableHeader}>
          <span>File</span>
          <span>Status</span>
          <span className={widgetStyles.conflictDurationHeader}>Duration</span>
          <span>Editors</span>
        </div>
        <div className={widgetStyles.conflictTableBody}>
          {groups.map((group, i) => (
            <FileRow
              key={`${group.teamId}\u0000${group.file}`}
              group={group}
              lock={locksByFile.get(group.file)}
              index={i}
              onClick={() => onOpenProject(group.teamId)}
            />
          ))}
        </div>
      </div>
    );

  const activeQuestions: FocusedQuestion[] =
    activeTab === 'agents'
      ? [
          {
            id: 'active-agents',
            question: 'Who is working right now?',
            answer: focusedAgent ? (
              <>
                <Metric>{focusedAgent.handle}</Metric> is focused in a live set of{' '}
                <Metric>{totalAgents}</Metric> agents across <Metric>{activeTools}</Metric> tools.
              </>
            ) : (
              <>
                <Metric>{totalAgents}</Metric> agents are active across{' '}
                <Metric>{activeTools}</Metric> tools.
              </>
            ),
            children: agentsTable,
          },
        ]
      : activeTab === 'conflicts'
        ? [
            {
              id: 'conflicts',
              question: 'Where are agents colliding right now?',
              answer:
                conflicts.length > 0 ? (
                  <>
                    <Metric>{conflicts[0].file}</Metric> has{' '}
                    <Metric tone="warning">{conflicts[0].agents.length}</Metric> active editors.
                  </>
                ) : (
                  <>No collisions right now.</>
                ),
              children: renderFileTable(conflicts, 'No collisions right now.'),
            },
          ]
        : [
            {
              id: 'files-in-play',
              question: 'Which files are in play?',
              answer:
                filesInPlay.length > 0 ? (
                  <>
                    <Metric>{totalFilesInPlay}</Metric> files are currently open across{' '}
                    <Metric>{totalAgents}</Metric> live agents.
                  </>
                ) : (
                  <>No active files right now.</>
                ),
              children: renderFileTable(filesInPlay, 'No active files right now.'),
            },
            {
              id: 'by-claim-age',
              question: 'Which claims have been held longest?',
              answer:
                claimedFilesInPlay.length > 0 ? (
                  <>
                    <Metric>{claimedFilesInPlay[0].file}</Metric> is the oldest visible claim.
                  </>
                ) : (
                  <>No claimed active files right now.</>
                ),
              children: renderFileTable(claimedFilesInPlay, 'No claimed active files right now.'),
            },
          ];

  return (
    <DetailView
      backLabel={backLabel}
      onBack={onBack}
      title="live"
      subtitle={liveSubtitle}
      tabs={tabs}
      tabControl={tabControl}
      idPrefix="live"
      tablistLabel="Live sections"
      panelCompact
    >
      <FocusedDetailView
        questions={activeQuestions}
        activeId={questionParam}
        onSelect={(id) => setQueryParam('q', id)}
      />
    </DetailView>
  );
}
