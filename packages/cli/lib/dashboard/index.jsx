import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { HintRow } from './ui.jsx';
import { useDashboardConnection } from './connection.jsx';
import { useMemoryManager } from './memory.js';
import { useAgentLifecycle } from './agents.js';
import { useComposer } from './composer.js';
import { useIntegrationDoctor } from './integrations.js';
import { createInputHandler, createCommandHandler } from './input.js';
import { MainPane, MemoryView, SessionsView } from './main-pane.jsx';
import { AgentFocusView } from './agent-focus.jsx';
import { MIN_WIDTH, SPINNER, openWebDashboard, formatProjectPath } from './utils.js';
import { isAgentAddressable } from './agent-display.js';
import {
  ConnectionProvider,
  AgentProvider,
  MemoryProvider,
  CommandPaletteProvider,
  useAgents,
  useMemory,
  useCommandPalette,
} from './context.jsx';

// ── View management hook ────────────────────────────

function useViewManager() {
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [mainFocus, setMainFocus] = useState('input');
  const [view, setView] = useState('home');
  const [heroInput, setHeroInput] = useState('');
  const [heroInputActive, setHeroInputActive] = useState(false);
  const [focusedAgent, setFocusedAgent] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const isHomeView = view === 'home';
  const isSessionsView = view === 'sessions';
  const isMemoryView = view === 'memory';
  const isAgentFocusView = view === 'agent-focus';

  return {
    selectedIdx,
    setSelectedIdx,
    mainFocus,
    setMainFocus,
    view,
    setView,
    heroInput,
    setHeroInput,
    heroInputActive,
    setHeroInputActive,
    focusedAgent,
    setFocusedAgent,
    showDiagnostics,
    setShowDiagnostics,
    isHomeView,
    isSessionsView,
    isMemoryView,
    isAgentFocusView,
  };
}

// ── Flash notification hook ─────────────────────────

function useFlashNotification() {
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  const flash = useCallback(function flash(msg, opts = {}) {
    const tone = typeof opts === 'object' ? opts.tone || 'info' : 'info';
    const autoClearMs = typeof opts === 'object' ? opts.autoClearMs : null;
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
      noticeTimer.current = null;
    }
    setNotice({ text: msg, tone });
    if (autoClearMs && autoClearMs > 0) {
      noticeTimer.current = setTimeout(() => {
        setNotice((current) => (current?.text === msg ? null : current));
        noticeTimer.current = null;
      }, autoClearMs);
    }
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  return { notice, flash };
}

// ── Main Dashboard component ────────────────────────

export function Dashboard({
  config,
  navigate,
  layout,
  projectLabel = null,
  appVersion = '0.1.0',
  setFooterHints,
}) {
  const { stdout } = useStdout();
  const viewportRows = layout?.viewportRows || 18;

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

  // ── View state ─────────────────────────────────────
  const vm = useViewManager();
  const {
    selectedIdx,
    setSelectedIdx,
    mainFocus,
    setMainFocus,
    view,
    setView,
    heroInput,
    setHeroInput,
    heroInputActive,
    setHeroInputActive,
    focusedAgent,
    setFocusedAgent,
    showDiagnostics,
    setShowDiagnostics,
    isHomeView,
    isSessionsView,
    isMemoryView,
    isAgentFocusView,
  } = vm;

  // ── Flash notification ─────────────────────────────
  const { notice, flash } = useFlashNotification();

  // ── Custom hooks ───────────────────────────────────
  const memoryHook = useMemoryManager({ config, teamId, bumpRefreshKey, flash });
  const agentsHook = useAgentLifecycle({ config, teamId, projectRoot, stdout, flash });
  const integrations = useIntegrationDoctor({ projectRoot, flash });
  const composer = useComposer({
    config,
    teamId,
    bumpRefreshKey,
    flash,
    clearMemorySearch: memoryHook.clearMemorySearch,
    clearMemoryInput: memoryHook.clearMemoryInput,
  });

  // ── Compose the providers, then render the inner component ──
  // The inner component uses context hooks to access derived data.
  return (
    <ConnectionProvider connection={connection}>
      <AgentProvider
        agents={agentsHook}
        context={context}
        detectedTools={detectedTools}
        teamName={teamName}
        cols={cols}
        selectedIdx={selectedIdx}
        setSelectedIdx={setSelectedIdx}
        mainFocus={mainFocus}
        setMainFocus={setMainFocus}
        viewportRows={viewportRows}
      >
        <MemoryProvider
          memory={memoryHook}
          context={context}
          detectedTools={detectedTools}
          teamName={teamName}
          cols={cols}
          composeMode={composer.composeMode}
          viewportRows={viewportRows}
        >
          <DashboardInner
            config={config}
            navigate={navigate}
            viewportRows={viewportRows}
            setFooterHints={setFooterHints}
            connection={connection}
            vm={vm}
            notice={notice}
            flash={flash}
            memoryHook={memoryHook}
            agentsHook={agentsHook}
            integrations={integrations}
            composer={composer}
          />
        </MemoryProvider>
      </AgentProvider>
    </ConnectionProvider>
  );
}

/**
 * Bridge component: reads Agent/Memory contexts to get derived data needed
 * by CommandPaletteProvider, then wraps the main view in that provider.
 */
function DashboardInner({
  config,
  navigate,
  viewportRows,
  setFooterHints,
  connection,
  vm,
  notice,
  flash,
  memoryHook,
  agentsHook,
  integrations,
  composer,
}) {
  const { selectedAgent, hasLiveAgents } = useAgents();
  const { hasMemories } = useMemory();

  return (
    <CommandPaletteProvider
      composer={composer}
      agents={agentsHook}
      integrations={integrations}
      hasMemories={hasMemories}
      hasLiveAgents={hasLiveAgents}
      selectedAgent={selectedAgent}
    >
      <DashboardView
        config={config}
        navigate={navigate}
        viewportRows={viewportRows}
        setFooterHints={setFooterHints}
        connection={connection}
        vm={vm}
        notice={notice}
        flash={flash}
        memoryHook={memoryHook}
        agentsHook={agentsHook}
        integrations={integrations}
        composer={composer}
      />
    </CommandPaletteProvider>
  );
}

/**
 * Handles input, rendering, and all view-level logic.
 * Consumes all 4 domain contexts for derived data.
 */
function DashboardView({
  config,
  navigate,
  viewportRows,
  setFooterHints,
  connection,
  vm,
  notice,
  flash,
  memoryHook,
  agentsHook,
  integrations,
  composer,
}) {
  const {
    teamId,
    context,
    error,
    connState,
    connDetail,
    spinnerFrame,
    cols,
    projectRoot,
    retry: connectionRetry,
  } = connection;

  const {
    selectedIdx,
    setSelectedIdx,
    mainFocus,
    setMainFocus,
    view,
    setView,
    heroInput,
    setHeroInput,
    setHeroInputActive,
    focusedAgent,
    setFocusedAgent,
    showDiagnostics,
    setShowDiagnostics,
    isSessionsView,
    isMemoryView,
    isAgentFocusView,
  } = vm;

  // ── Context-derived data ───────────────────────────
  const {
    combinedAgents,
    liveAgents,
    allVisibleAgents,
    selectedAgent,
    mainSelectedAgent,
    hasLiveAgents,
    liveAgentNameCounts,
    visibleSessionRows,
    conflicts,
  } = useAgents();

  const { memories, filteredMemories, visibleMemories, visibleKnowledgeRows, hasMemories } =
    useMemory();

  const { commandSuggestions } = useCommandPalette();

  const projectDisplayName = formatProjectPath(projectRoot);

  // ── Footer hints (pushed to shell) ─────────────────
  useEffect(() => {
    if (!setFooterHints) return;
    if (composer.isComposing) {
      setFooterHints([
        { key: 'esc', label: 'back' },
        { key: 'q', label: 'quit', color: 'gray' },
      ]);
    } else {
      const ready = agentsHook.readyCliAgents;
      const primary = ready[0] || agentsHook.installedCliAgents[0];
      const nLabel = primary
        ? ready.length > 1
          ? 'new agent'
          : `new ${primary.name}`
        : 'new agent';
      setFooterHints([
        { key: 'n', label: nLabel, color: 'green' },
        { key: 'w', label: 'web' },
        { key: '/', label: 'more' },
        { key: 'q', label: 'quit', color: 'gray' },
      ]);
    }
  }, [composer.isComposing, agentsHook.installedCliAgents, agentsHook.managedToolStates]);

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

  /* eslint-disable react-hooks/exhaustive-deps */
  // Factory function patterns — React Compiler can't infer closure deps
  // from createCommandHandler/createInputHandler factories.
  const handleCommandSubmit = useMemo(
    () =>
      createCommandHandler({
        agents: agentsHook,
        integrations,
        composer,
        memory: memoryHook,
        flash,
        setView,
        setSelectedIdx,
        setHeroInput,
        setHeroInputActive,
        setMainFocus,
        handleOpenWebDashboard,
        liveAgents,
        selectedAgent,
        isAgentAddressable,
      }),
    [
      agentsHook,
      integrations,
      composer,
      memoryHook,
      flash,
      handleOpenWebDashboard,
      liveAgents,
      selectedAgent,
    ],
  );

  const inputHandler = useMemo(
    () =>
      createInputHandler({
        view,
        setView,
        mainFocus,
        setMainFocus,
        selectedIdx,
        setSelectedIdx,
        focusedAgent,
        setFocusedAgent,
        showDiagnostics,
        setShowDiagnostics,
        setHeroInput,
        setHeroInputActive,
        cols,
        error,
        context,
        connectionRetry,
        allVisibleAgents,
        liveAgents,
        visibleMemories,
        hasLiveAgents,
        hasMemories,
        mainSelectedAgent,
        liveAgentNameCounts,
        agents: agentsHook,
        integrations,
        composer,
        memory: memoryHook,
        commandSuggestions,
        handleCommandSubmit,
        handleOpenWebDashboard,
        navigate,
      }),
    [
      view,
      mainFocus,
      selectedIdx,
      focusedAgent,
      showDiagnostics,
      cols,
      error,
      context,
      connectionRetry,
      allVisibleAgents,
      liveAgents,
      visibleMemories,
      hasLiveAgents,
      hasMemories,
      mainSelectedAgent,
      liveAgentNameCounts,
      agentsHook,
      integrations,
      composer,
      memoryHook,
      commandSuggestions,
      handleCommandSubmit,
      handleOpenWebDashboard,
      navigate,
    ],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const onComposeSubmit = useCallback(() => {
    composer.onComposeSubmit(commandSuggestions, handleCommandSubmit);
  }, [composer, commandSuggestions, handleCommandSubmit]);

  const onMemorySubmit = useCallback(() => {
    memoryHook.onMemorySubmit();
    composer.setComposeMode(null);
  }, [memoryHook, composer]);

  useInput(inputHandler);

  // ── Nav hints ──────────────────────────────────────
  const navItems = useMemo(() => {
    if (isAgentFocusView) {
      const items = [{ key: 'esc', label: 'back', color: 'cyan' }];
      if (focusedAgent?._managed && !focusedAgent._dead)
        items.push({ key: 'x', label: 'stop', color: 'red' });
      if (focusedAgent?._managed && focusedAgent._dead) {
        items.push({ key: 'r', label: 'restart', color: 'green' });
        items.push({ key: 'x', label: 'remove', color: 'red' });
      }
      if (isAgentAddressable(focusedAgent))
        items.push({ key: 'm', label: 'message', color: 'cyan' });
      if (focusedAgent?._managed)
        items.push({
          key: 'l',
          label: showDiagnostics ? 'hide diagnostics' : 'diagnostics',
          color: 'yellow',
        });
      return items;
    }
    if (composer.isComposing) {
      return [
        {
          key: 'enter',
          label:
            composer.composeMode === 'memory-add'
              ? 'save'
              : composer.composeMode === 'memory-search'
                ? 'search'
                : 'send',
          color: 'green',
        },
        { key: 'esc', label: 'cancel', color: 'cyan' },
      ];
    }
    return [{ key: 'q', label: 'quit', color: 'gray' }];
  }, [isAgentFocusView, focusedAgent, showDiagnostics, composer.isComposing, composer.composeMode]);

  // ── Contextual hints ───────────────────────────────
  const contextHints = useMemo(() => {
    const hints = [];
    if (mainSelectedAgent) {
      hints.push({ commandKey: 'enter', label: 'inspect', color: 'cyan' });
      if (isAgentAddressable(mainSelectedAgent))
        hints.push({ commandKey: 'm', label: 'message', color: 'cyan' });
      if (mainSelectedAgent._managed && !mainSelectedAgent._dead)
        hints.push({ commandKey: 'x', label: 'stop', color: 'red' });
    }
    return hints;
  }, [mainSelectedAgent]);

  // ── Guards ─────────────────────────────────────────
  if (cols < MIN_WIDTH) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>
          Terminal too narrow ({cols} cols). Widen to at least {MIN_WIDTH}.
        </Text>
        <Text>{''}</Text>
        <Text>
          <Text color="cyan" bold>
            [q]
          </Text>
          <Text dimColor> quit</Text>
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text color="red" bold>
          {error}
        </Text>
        <Text>{''}</Text>
        <Text dimColor>
          {error.includes('chinwag init')
            ? 'Set up this project first, then relaunch.'
            : error.includes('expired')
              ? 'Your auth token is no longer valid.'
              : 'Check the issue above and try again.'}
        </Text>
        <HintRow
          hints={[
            ...(error.includes('expired') || error.includes('.chinwag')
              ? []
              : [{ commandKey: 'r', label: 'retry', color: 'cyan' }]),
            { commandKey: 'q', label: 'quit', color: 'gray' },
          ]}
        />
      </Box>
    );
  }

  if (!context) {
    const isAutoRetrying = connState === 'connecting' || connState === 'reconnecting';
    const spin = SPINNER[spinnerFrame];
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        {isAutoRetrying ? (
          <Text>
            <Text color="cyan">{spin} </Text>
            <Text color="cyan">
              {connState === 'connecting' ? 'Connecting to team' : connDetail || 'Reconnecting'}
            </Text>
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text color="red">{connDetail || 'Cannot reach server.'}</Text>
            <Text>{''}</Text>
            <HintRow
              hints={[
                { commandKey: 'r', label: 'retry now', color: 'cyan' },
                { commandKey: 'q', label: 'quit', color: 'gray' },
              ]}
            />
          </Box>
        )}
      </Box>
    );
  }

  // ── Agent focus view ───────────────────────────────
  if (isAgentFocusView && focusedAgent) {
    return (
      <AgentFocusView
        focusedAgent={focusedAgent}
        combinedAgents={combinedAgents}
        conflicts={conflicts}
        notice={notice}
        showDiagnostics={showDiagnostics}
        liveAgentNameCounts={liveAgentNameCounts}
        navHints={navItems.map((item) => ({
          commandKey: item.key,
          label: item.label,
          color: item.color || 'cyan',
        }))}
      />
    );
  }

  // ── Memory view ────────────────────────────────────
  if (isMemoryView) {
    return (
      <MemoryView
        memories={memories}
        filteredMemories={filteredMemories}
        visibleKnowledgeRows={visibleKnowledgeRows}
        memory={memoryHook}
        composer={composer}
        notice={notice}
        commandSuggestions={commandSuggestions}
        onComposeSubmit={onComposeSubmit}
        onMemorySubmit={onMemorySubmit}
      />
    );
  }

  // ── Sessions view ──────────────────────────────────
  if (isSessionsView) {
    return (
      <SessionsView
        liveAgents={liveAgents}
        visibleSessionRows={visibleSessionRows}
        selectedIdx={selectedIdx}
        cols={cols}
        composer={composer}
        memory={memoryHook}
        notice={notice}
        commandSuggestions={commandSuggestions}
        onComposeSubmit={onComposeSubmit}
        onMemorySubmit={onMemorySubmit}
      />
    );
  }

  // ── Home view ──────────────────────────────────────
  return (
    <MainPane
      projectDisplayName={projectDisplayName}
      connState={connState}
      connDetail={connDetail}
      spinnerFrame={spinnerFrame}
      cols={cols}
      allVisibleAgents={allVisibleAgents}
      liveAgents={liveAgents}
      visibleSessionRows={visibleSessionRows}
      selectedIdx={selectedIdx}
      mainFocus={mainFocus}
      liveAgentNameCounts={liveAgentNameCounts}
      agents={agentsHook}
      integrationIssues={integrations.integrationIssues}
      composer={composer}
      memory={memoryHook}
      notice={notice}
      contextHints={contextHints}
      commandSuggestions={commandSuggestions}
      onComposeSubmit={onComposeSubmit}
      onMemorySubmit={onMemorySubmit}
    />
  );
}
