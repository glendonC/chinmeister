import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import clsx from 'clsx';
import { getToolMeta } from '../../lib/toolMeta.js';
import { formatDuration } from '../../lib/utils.js';
import { formatRelativeTime } from '../../lib/relativeTime.js';
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
import type { Lock, Session } from '../../lib/apiSchemas.js';
import { FileRow } from '../../widgets/bodies/LiveWidgets.js';
import widgetStyles from '../../widgets/bodies/LiveWidgets.module.css';
import { formatScope } from './overview-utils.js';
import { fileBasename } from './CodebaseDetailView/format.js';
import styles from './LiveNowView.module.css';

// Mirrors the LiveWidgets editor-handle stale window: an agent whose
// heartbeat is older than this fades to signal "cooling off". Keeping
// the value identical to widgets/bodies/LiveWidgets.tsx STALE_AFTER_SECONDS
// so the surface and drill-in agree on which agents read as stale.
const STALE_AFTER_SECONDS = 30;

const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const FILE_MATRIX_CAP = 20;

// Pure helpers extracted out of the component so the React Compiler
// purity lint accepts the wall-clock read. The memo wrapping these
// re-runs whenever recentSessions or focusedAgent change, which is the
// same cadence the rest of the live tab refreshes at.
function filterRecentSessions(
  sessions: Session[] | undefined,
  focusedAgentId: string | null,
): Session[] {
  if (!sessions || sessions.length === 0) return [];
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  const filtered = sessions.filter((s) => {
    const started = new Date(s.started_at).getTime();
    if (!Number.isFinite(started) || started < cutoff) return false;
    if (focusedAgentId && s.agent_id !== focusedAgentId) return false;
    return true;
  });
  return filtered.sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
}

function tallyHistory(sessions: Session[]): {
  completed: number;
  abandoned: number;
  active: number;
  conflicted: number;
} {
  let completed = 0;
  let abandoned = 0;
  let active = 0;
  let conflicted = 0;
  for (const s of sessions) {
    if (!s.ended_at) active += 1;
    else if (s.outcome === 'completed') completed += 1;
    else abandoned += 1;
    if ((s.conflicts_hit ?? 0) > 0) conflicted += 1;
  }
  return { completed, abandoned, active, conflicted };
}

interface FileRetryRow {
  file: string;
  sessions: number;
  edits: number;
  agents: Set<string>;
  completed: number;
  failed: number;
}

function buildFileRetryRows(sessions: Session[]): FileRetryRow[] {
  const map = new Map<string, FileRetryRow>();
  for (const s of sessions) {
    const files = s.files_touched ?? [];
    if (files.length === 0) continue;
    const editsPerFile = Math.max(1, Math.round((s.edit_count ?? 0) / files.length));
    for (const f of files) {
      const entry = map.get(f) ?? {
        file: f,
        sessions: 0,
        edits: 0,
        agents: new Set<string>(),
        completed: 0,
        failed: 0,
      };
      entry.sessions += 1;
      entry.edits += editsPerFile;
      entry.agents.add(s.handle || s.owner_handle || s.agent_id);
      if (s.outcome === 'completed') entry.completed += 1;
      else if (s.ended_at) entry.failed += 1;
      map.set(f, entry);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.edits - a.edits || b.sessions - a.sessions)
    .slice(0, FILE_MATRIX_CAP);
}

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
  // Project-scoped recent sessions. When provided, the Agents tab gains
  // 24h history and per-file retry questions. OverviewView omits this
  // because cross-project session aggregation is not plumbed today; the
  // tab degrades cleanly to its single live-presence question.
  recentSessions?: Session[];
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
  recentSessions,
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

  // Memos for the optional 24h history Q live above the early-return so
  // hook order stays stable; the helpers are pure no-op when recentSessions
  // is undefined or the agents list is empty.
  const focusedAgentId = focusAgentId ?? null;
  const recentWindowSessions = useMemo(
    () => filterRecentSessions(recentSessions, focusedAgentId),
    [recentSessions, focusedAgentId],
  );
  const historyTally = useMemo(() => tallyHistory(recentWindowSessions), [recentWindowSessions]);
  const fileRetryRows = useMemo(
    () => buildFileRetryRows(recentWindowSessions),
    [recentWindowSessions],
  );

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

  const historyTable =
    recentWindowSessions.length === 0 ? (
      <span className={styles.empty}>No sessions in the last 24 hours.</span>
    ) : (
      <div className={styles.historyTable}>
        <div className={styles.historyHeader}>
          <span>Started</span>
          <span>Member</span>
          <span>Tool</span>
          <span className={styles.numHeader}>Files</span>
          <span className={styles.numHeader}>Duration</span>
          <span className={styles.numHeader}>Edits</span>
          <span>Outcome</span>
        </div>
        {recentWindowSessions.map((s, i) => {
          const meta = getToolMeta(s.host_tool);
          const handle = s.handle || s.owner_handle || 'Agent';
          const started = formatRelativeTime(s.started_at) ?? '-';
          const filesCount = s.files_touched?.length ?? 0;
          const dur =
            s.duration_minutes != null && s.duration_minutes > 0
              ? formatDuration(s.duration_minutes)
              : !s.ended_at
                ? 'live'
                : '-';
          const edits = s.edit_count ?? 0;
          const outcome = !s.ended_at
            ? 'active'
            : s.outcome === 'completed'
              ? 'completed'
              : (s.outcome ?? 'abandoned');
          const outcomeTone =
            outcome === 'completed'
              ? styles.outcomeOk
              : outcome === 'active'
                ? styles.outcomeLive
                : styles.outcomeFail;
          return (
            <div
              key={`${s.agent_id} ${s.started_at} ${i}`}
              className={styles.historyRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.historyCell}>{started}</span>
              <span className={styles.agentName} style={{ color: meta.color }}>
                {handle}
              </span>
              <span className={clsx(styles.historyCell, styles.agentCellTool)}>
                <ToolIcon tool={s.host_tool} size={16} />
                <span>{meta.label}</span>
              </span>
              <span
                className={clsx(styles.agentCellNum, filesCount === 0 && styles.agentCellMuted)}
              >
                {filesCount}
              </span>
              <span className={clsx(styles.agentCellNum, dur === '-' && styles.agentCellMuted)}>
                {dur}
              </span>
              <span className={clsx(styles.agentCellNum, edits === 0 && styles.agentCellMuted)}>
                {edits}
              </span>
              <span className={clsx(styles.outcomeChip, outcomeTone)}>{outcome}</span>
            </div>
          );
        })}
      </div>
    );

  const fileMatrixTable =
    fileRetryRows.length === 0 ? (
      <span className={styles.empty}>No file activity in the last 24 hours.</span>
    ) : (
      <div className={styles.fileMatrixTable}>
        <div className={styles.fileMatrixHeader}>
          <span>File</span>
          <span className={styles.numHeader}>Sessions</span>
          <span className={styles.numHeader}>Edits</span>
          <span className={styles.numHeader}>Agents</span>
          <span>Outcome</span>
        </div>
        {fileRetryRows.map((row, i) => {
          const failed = row.failed;
          const completed = row.completed;
          const tone =
            failed > completed
              ? styles.outcomeFail
              : completed > 0
                ? styles.outcomeOk
                : styles.outcomeMuted;
          const summary =
            completed + failed === 0 ? 'in flight' : `${completed} ok / ${failed} fail`;
          return (
            <div
              key={row.file}
              className={styles.fileMatrixRow}
              style={{ '--row-index': i } as CSSProperties}
              title={row.file}
            >
              <span className={styles.fileMatrixName}>{fileBasename(row.file)}</span>
              <span className={styles.agentCellNum}>{row.sessions}</span>
              <span className={styles.agentCellNum}>{row.edits}</span>
              <span className={styles.agentCellNum}>{row.agents.size}</span>
              <span className={clsx(styles.outcomeChip, tone)}>{summary}</span>
            </div>
          );
        })}
      </div>
    );

  // The history/files Qs only render when the host wires recentSessions
  // in. OverviewView passes nothing today, cross-project session
  // aggregation is not plumbed; ProjectView passes its allSessions
  // array. Splitting the answer noun by focus keeps the line honest:
  // "this agent" vs "your project" depending on focusAgentId.
  const historyAnswer = (() => {
    const subject = focusedAgent ? focusedAgent.handle : 'Your project';
    const total = recentWindowSessions.length;
    if (total === 0) {
      return <>No sessions yet in the last 24 hours.</>;
    }
    return (
      <>
        <Metric>{subject}</Metric> ran <Metric>{total}</Metric> sessions in the last 24h:{' '}
        <Metric>{historyTally.completed}</Metric> completed,{' '}
        <Metric>{historyTally.abandoned}</Metric> abandoned, <Metric>{historyTally.active}</Metric>{' '}
        active. Hit conflicts in <Metric>{historyTally.conflicted}</Metric>.
      </>
    );
  })();
  const filesAnswer = (() => {
    const top = fileRetryRows[0];
    if (!top) {
      return <>No files touched in the last 24 hours.</>;
    }
    return (
      <>
        <Metric>{fileBasename(top.file)}</Metric> saw the most rework: <Metric>{top.edits}</Metric>{' '}
        edits across <Metric>{top.sessions}</Metric> sessions
        {top.agents.size > 1 ? (
          <>
            {' '}
            from <Metric>{top.agents.size}</Metric> agents
          </>
        ) : null}
        .
      </>
    );
  })();

  const agentsQuestions: FocusedQuestion[] = [
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
          <Metric>{totalAgents}</Metric> agents are active across <Metric>{activeTools}</Metric>{' '}
          tools.
        </>
      ),
      children: agentsTable,
    },
  ];
  if (recentSessions) {
    agentsQuestions.push(
      {
        id: 'agent-history',
        question: focusedAgent
          ? `What is ${focusedAgent.handle}'s last 24h?`
          : 'What ran in the last 24 hours?',
        answer: historyAnswer,
        children: historyTable,
      },
      {
        id: 'agent-files',
        question: focusedAgent
          ? `Which files has ${focusedAgent.handle} been working on?`
          : 'Which files saw the most rework?',
        answer: filesAnswer,
        children: fileMatrixTable,
      },
    );
  }

  const activeQuestions: FocusedQuestion[] =
    activeTab === 'agents'
      ? agentsQuestions
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
