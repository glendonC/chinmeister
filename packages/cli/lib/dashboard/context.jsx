import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { basename } from 'path';
import { buildCombinedAgentRows, buildDashboardView } from './view.js';
import { isAgentAddressable } from './agent-display.js';
import { getVisibleWindow } from './utils.js';

// ── Constants ───────────────────────────────────────
const RECENTLY_FINISHED_LIMIT = 3;
const MIN_VIEWPORT_ROWS = 4;
const VIEWPORT_CHROME_ROWS = 11;
const COMMAND_SUGGESTION_LIMIT = 5;

// ── Contexts ────────────────────────────────────────

const ConnectionContext = createContext(null);
const AgentContext = createContext(null);
const MemoryContext = createContext(null);
const CommandPaletteContext = createContext(null);

// ── Hooks ───────────────────────────────────────────

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}

export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgents must be used within AgentProvider');
  return ctx;
}

export function useMemory() {
  const ctx = useContext(MemoryContext);
  if (!ctx) throw new Error('useMemory must be used within MemoryProvider');
  return ctx;
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  return ctx;
}

// ── Providers ───────────────────────────────────────

/**
 * Connection state: teamId, teamName, projectRoot, connState, etc.
 * Thin wrapper — the useDashboardConnection hook does the real work.
 */
export function ConnectionProvider({ connection, children }) {
  return <ConnectionContext.Provider value={connection}>{children}</ConnectionContext.Provider>;
}

/**
 * Agent context: raw agents hook + derived agent data.
 * Owns: combinedAgents, liveAgents, allVisibleAgents, selection clamping,
 * visibleSessionRows, liveAgentNameCounts, conflicts.
 */
export function AgentProvider({
  agents,
  context,
  detectedTools,
  teamName,
  cols,
  selectedIdx,
  setSelectedIdx,
  mainFocus,
  setMainFocus,
  viewportRows,
  children,
}) {
  // Build dashboard view data (tool name resolver, visible agents, conflicts)
  const dashboardView = useMemo(
    () =>
      buildDashboardView({
        context,
        detectedTools,
        memoryFilter: null,
        memorySearch: '',
        cols,
        projectDir: teamName || basename(process.cwd()),
      }),
    [context, detectedTools, cols, teamName],
  );

  // Build combined agent rows from managed + connected
  const combinedAgents = useMemo(
    () =>
      buildCombinedAgentRows({
        managedAgents: agents.managedAgents,
        connectedAgents: dashboardView.visibleAgents,
        getToolName: dashboardView.getToolName,
      }),
    [agents.managedAgents, dashboardView.visibleAgents, dashboardView.getToolName],
  );

  const liveAgents = useMemo(
    () => combinedAgents.filter((agent) => !agent._dead),
    [combinedAgents],
  );

  const recentlyFinished = useMemo(
    () =>
      combinedAgents
        .filter((agent) => agent._managed && agent._dead)
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        .slice(0, RECENTLY_FINISHED_LIMIT),
    [combinedAgents],
  );

  const allVisibleAgents = useMemo(
    () => [...liveAgents, ...recentlyFinished],
    [liveAgents, recentlyFinished],
  );

  const selectedAgent = selectedIdx >= 0 ? allVisibleAgents[selectedIdx] : null;
  const mainSelectedAgent = mainFocus === 'agents' ? selectedAgent : null;
  const hasLiveAgents = liveAgents.length > 0;

  const liveAgentNameCounts = useMemo(
    () =>
      liveAgents.reduce((counts, agent) => {
        const label = agent._display || agent.toolName || agent.tool || 'agent';
        counts.set(label, (counts.get(label) || 0) + 1);
        return counts;
      }, new Map()),
    [liveAgents],
  );

  const maxViewportItems = Math.max(MIN_VIEWPORT_ROWS, viewportRows - VIEWPORT_CHROME_ROWS);
  const visibleSessionRows = useMemo(
    () => getVisibleWindow(allVisibleAgents, selectedIdx, maxViewportItems),
    [allVisibleAgents, selectedIdx, maxViewportItems],
  );

  // Clamp selection indices when agent list shrinks
  useEffect(() => {
    if (allVisibleAgents.length === 0) {
      if (selectedIdx !== -1) setSelectedIdx(-1);
      if (mainFocus === 'agents') setMainFocus('input');
      return;
    }
    if (selectedIdx >= allVisibleAgents.length) {
      setSelectedIdx(allVisibleAgents.length > 0 ? allVisibleAgents.length - 1 : -1);
    }
  }, [selectedIdx, allVisibleAgents.length, mainFocus]);

  const value = useMemo(
    () => ({
      // Raw agents hook (lifecycle actions, tool state, etc.)
      ...agents,
      // Derived data
      combinedAgents,
      liveAgents,
      allVisibleAgents,
      selectedAgent,
      mainSelectedAgent,
      hasLiveAgents,
      liveAgentNameCounts,
      visibleSessionRows,
      conflicts: dashboardView.conflicts,
      getToolName: dashboardView.getToolName,
    }),
    [
      agents,
      combinedAgents,
      liveAgents,
      allVisibleAgents,
      selectedAgent,
      mainSelectedAgent,
      hasLiveAgents,
      liveAgentNameCounts,
      visibleSessionRows,
      dashboardView.conflicts,
      dashboardView.getToolName,
    ],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

/**
 * Memory context: raw memory hook + derived memory data.
 * Owns: memories, filteredMemories, visibleMemories, visibleKnowledgeRows,
 * hasMemories, selection clamping.
 */
export function MemoryProvider({
  memory,
  context,
  detectedTools,
  teamName,
  cols,
  composeMode,
  viewportRows,
  children,
}) {
  const memorySearch = composeMode === 'memory-search' ? memory.memorySearch : '';

  // Build dashboard view data scoped to memory filtering
  const dashboardView = useMemo(
    () =>
      buildDashboardView({
        context,
        detectedTools,
        memoryFilter: null,
        memorySearch,
        cols,
        projectDir: teamName || basename(process.cwd()),
      }),
    [context, detectedTools, memorySearch, cols, teamName],
  );

  const { memories, filteredMemories, visibleMemories } = dashboardView;
  const hasMemories = memories.length > 0;

  const maxViewportItems = Math.max(MIN_VIEWPORT_ROWS, viewportRows - VIEWPORT_CHROME_ROWS);
  const visibleKnowledgeRows = useMemo(
    () => getVisibleWindow(visibleMemories, memory.memorySelectedIdx, maxViewportItems),
    [visibleMemories, memory.memorySelectedIdx, maxViewportItems],
  );

  // Clamp memory selection when list shrinks
  useEffect(() => {
    if (memory.memorySelectedIdx >= visibleMemories.length) {
      memory.setMemorySelectedIdx(visibleMemories.length > 0 ? visibleMemories.length - 1 : -1);
    }
  }, [memory.memorySelectedIdx, visibleMemories.length]);

  const value = useMemo(
    () => ({
      // Raw memory hook
      ...memory,
      // Derived data
      memories,
      filteredMemories,
      visibleMemories,
      visibleKnowledgeRows,
      hasMemories,
    }),
    [memory, memories, filteredMemories, visibleMemories, visibleKnowledgeRows, hasMemories],
  );

  return <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>;
}

/**
 * Command palette context: command suggestions derived from agent/memory/integration state.
 * Owns: commandEntries, commandSuggestions filtering.
 */
export function CommandPaletteProvider({
  composer,
  agents,
  integrations,
  hasMemories,
  hasLiveAgents,
  selectedAgent,
  children,
}) {
  // Command palette entries
  const commandEntries = useMemo(
    () => [
      { name: '/new', description: 'Open a tool in a new terminal tab' },
      ...(agents.unavailableCliAgents.some(
        (tool) => agents.getManagedToolState(tool.id).recoveryCommand,
      ) || integrations.integrationIssues.length > 0
        ? [{ name: '/fix', description: 'Open the main setup fix flow' }]
        : []),
      { name: '/recheck', description: 'Refresh available tools and integration health' },
      { name: '/doctor', description: 'Scan local Chinwag integration health' },
      ...(integrations.integrationIssues.length > 0
        ? [{ name: '/repair', description: 'Repair detected integration issues' }]
        : []),
      ...(hasMemories ? [{ name: '/knowledge', description: 'View shared knowledge' }] : []),
      ...(hasLiveAgents ? [{ name: '/history', description: 'View past agent activity' }] : []),
      { name: '/web', description: 'Open chinwag in browser' },
      ...(selectedAgent && isAgentAddressable(selectedAgent)
        ? [{ name: '/message', description: `Message ${selectedAgent._display}` }]
        : []),
      { name: '/help', description: 'Show command help' },
    ],
    [agents, integrations, hasMemories, hasLiveAgents, selectedAgent],
  );

  const commandQuery =
    composer.composeMode === 'command'
      ? composer.composeText.trim().replace(/^\//, '').toLowerCase()
      : '';

  const commandSuggestions = useMemo(() => {
    if (composer.composeMode !== 'command') return [];
    return commandEntries
      .filter((entry) => {
        if (!commandQuery) return true;
        const normalized = entry.name.slice(1).toLowerCase();
        return (
          normalized.startsWith(commandQuery) ||
          entry.description.toLowerCase().includes(commandQuery)
        );
      })
      .slice(0, COMMAND_SUGGESTION_LIMIT + 1);
  }, [composer.composeMode, commandEntries, commandQuery]);

  const value = useMemo(() => ({ commandSuggestions }), [commandSuggestions]);

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}
