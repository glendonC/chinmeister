import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { useStdout } from 'ink';
import { basename } from 'path';
import { useDashboardConnection } from './connection.jsx';
import { useMemoryManager } from './memory.js';
import { useAgentLifecycle } from './agents.js';
import { useComposer } from './composer.js';
import { useIntegrationDoctor } from './integrations.js';
import { dashboardReducer, createInitialState, setNotice, clearNotice } from './reducer.js';
import { buildCombinedAgentRows, buildDashboardView } from './view.js';
import { openWebDashboard, getVisibleWindow, formatProjectPath } from './utils.js';

// ── Constants ───────────────────────────────────────
const RECENTLY_FINISHED_LIMIT = 3;
const MIN_VIEWPORT_ROWS = 4;
const VIEWPORT_CHROME_ROWS = 11;

// ── Context ─────────────────────────────────────────

const DashboardContext = createContext(null);

/**
 * Access the dashboard context.
 * Must be called within a DashboardProvider.
 */
export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}

// ── Flash notification hook (uses reducer) ──────────

function useFlashNotification(dispatch) {
  const noticeTimer = useRef(null);

  const flash = useCallback(
    function flash(msg, opts = {}) {
      const tone = typeof opts === 'object' ? opts.tone || 'info' : 'info';
      const autoClearMs = typeof opts === 'object' ? opts.autoClearMs : null;
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
        noticeTimer.current = null;
      }
      dispatch(setNotice(msg, tone));
      if (autoClearMs && autoClearMs > 0) {
        noticeTimer.current = setTimeout(() => {
          dispatch(clearNotice(msg));
          noticeTimer.current = null;
        }, autoClearMs);
      }
    },
    [dispatch],
  );

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  return flash;
}

// ── Provider Component ──────────────────────────────

export function DashboardProvider({ config, navigate, layout, setFooterHints, children }) {
  const { stdout } = useStdout();
  const viewportRows = layout?.viewportRows || 18;

  // ── Reducer ────────────────────────────────────────
  const [state, dispatch] = useReducer(dashboardReducer, null, createInitialState);

  // ── Flash notification ─────────────────────────────
  const flash = useFlashNotification(dispatch);

  // ── Connection + project state ─────────────────────
  const connection = useDashboardConnection({ config, stdout });
  const {
    teamId,
    teamName,
    projectRoot,
    detectedTools,
    context,
    error,
    connState,
    connDetail,
    spinnerFrame,
    cols,
    retry: connectionRetry,
    bumpRefreshKey,
  } = connection;

  // ── Custom hooks ───────────────────────────────────
  const memory = useMemoryManager({ config, teamId, bumpRefreshKey, flash });
  const agents = useAgentLifecycle({ config, teamId, projectRoot, stdout, flash });
  const integrations = useIntegrationDoctor({ projectRoot, flash });
  const composer = useComposer({
    config,
    teamId,
    bumpRefreshKey,
    flash,
    clearMemorySearch: memory.clearMemorySearch,
    clearMemoryInput: memory.clearMemoryInput,
  });

  // ── Derived data (memoized) ────────────────────────

  // Group 1: dashboard view — filters members, builds conflicts, memory lists
  const { getToolName, conflicts, memories, filteredMemories, visibleMemories, visibleAgents } =
    useMemo(
      () =>
        buildDashboardView({
          context,
          detectedTools,
          memoryFilter: null,
          memorySearch: composer.composeMode === 'memory-search' ? memory.memorySearch : '',
          cols,
          projectDir: teamName || basename(process.cwd()),
        }),
      [context, detectedTools, composer.composeMode, memory.memorySearch, cols, teamName],
    );

  // Group 2: agent rows + selection state
  const {
    combinedAgents,
    liveAgents,
    recentlyFinished,
    allVisibleAgents,
    selectedAgent,
    mainSelectedAgent,
    knowledgeVisible,
  } = useMemo(() => {
    const combined = buildCombinedAgentRows({
      managedAgents: agents.managedAgents,
      connectedAgents: visibleAgents,
      getToolName,
    });
    const live = combined.filter((agent) => !agent._dead);
    const finished = combined
      .filter((agent) => agent._managed && agent._dead)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, RECENTLY_FINISHED_LIMIT);
    const allVisible = [...live, ...finished];
    const selected = state.selectedIdx >= 0 ? allVisible[state.selectedIdx] : null;
    const mainSelected = state.mainFocus === 'agents' ? selected : null;
    const knowledge =
      state.view === 'memory' ||
      composer.composeMode === 'memory-search' ||
      composer.composeMode === 'memory-add'
        ? visibleMemories
        : visibleMemories.slice(0, Math.min(1, visibleMemories.length));

    return {
      combinedAgents: combined,
      liveAgents: live,
      recentlyFinished: finished,
      allVisibleAgents: allVisible,
      selectedAgent: selected,
      mainSelectedAgent: mainSelected,
      knowledgeVisible: knowledge,
    };
  }, [
    agents.managedAgents,
    visibleAgents,
    getToolName,
    state.selectedIdx,
    state.mainFocus,
    state.view,
    composer.composeMode,
    visibleMemories,
  ]);

  // Group 3: display helpers — counts, project name, windowed rows
  const {
    hasLiveAgents,
    hasMemories,
    projectDisplayName,
    liveAgentNameCounts,
    visibleSessionRows,
    visibleKnowledgeRows,
  } = useMemo(() => {
    const nameCounts = liveAgents.reduce((counts, agent) => {
      const label = agent._display || agent.toolName || agent.tool || 'agent';
      counts.set(label, (counts.get(label) || 0) + 1);
      return counts;
    }, new Map());
    const maxRows = Math.max(MIN_VIEWPORT_ROWS, viewportRows - VIEWPORT_CHROME_ROWS);

    return {
      hasLiveAgents: liveAgents.length > 0,
      hasMemories: memories.length > 0,
      projectDisplayName: formatProjectPath(projectRoot),
      liveAgentNameCounts: nameCounts,
      visibleSessionRows: getVisibleWindow(allVisibleAgents, state.selectedIdx, maxRows),
      visibleKnowledgeRows: getVisibleWindow(knowledgeVisible, memory.memorySelectedIdx, maxRows),
    };
  }, [
    liveAgents,
    memories,
    projectRoot,
    allVisibleAgents,
    state.selectedIdx,
    viewportRows,
    knowledgeVisible,
    memory.memorySelectedIdx,
  ]);

  // ── Handlers ───────────────────────────────────────
  const handleOpenWebDashboard = useCallback(() => {
    const result = openWebDashboard(config?.token);
    flash(
      result.ok
        ? 'Opened web dashboard'
        : `Could not open browser${result.error ? `: ${result.error}` : ''}`,
      result.ok ? { tone: 'success' } : { tone: 'error' },
    );
  }, [config?.token, flash]);

  // ── Context value ──────────────────────────────────
  const value = {
    state,
    dispatch,
    flash,
    config,
    navigate,
    layout,
    viewportRows,
    connection,
    teamId,
    teamName,
    projectRoot,
    detectedTools,
    context,
    error,
    connState,
    connDetail,
    spinnerFrame,
    cols,
    connectionRetry,
    bumpRefreshKey,
    memory,
    agents,
    integrations,
    composer,
    getToolName,
    conflicts,
    memories,
    filteredMemories,
    visibleMemories,
    visibleAgents,
    combinedAgents,
    liveAgents,
    recentlyFinished,
    allVisibleAgents,
    selectedAgent,
    mainSelectedAgent,
    knowledgeVisible,
    hasLiveAgents,
    hasMemories,
    projectDisplayName,
    liveAgentNameCounts,
    visibleSessionRows,
    visibleKnowledgeRows,
    handleOpenWebDashboard,
    setFooterHints,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
