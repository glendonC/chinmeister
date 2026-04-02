import { describe, it, expect, vi } from 'vitest';
import { createInputHandler, createCommandHandler } from '../dashboard/input.js';

// ── Helpers ────────────────────────────────────────────

/** Build a minimal key object for testing. */
function key(overrides = {}) {
  return {
    escape: false, return: false, tab: false,
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    ...overrides,
  };
}

/** Build a minimal mock context with sensible defaults. */
function buildCtx(overrides = {}) {
  // Extract state-level overrides from top-level for convenience
  const {
    view = 'home',
    mainFocus = 'input',
    selectedIdx = -1,
    focusedAgent = null,
    showDiagnostics = false,
    composeMode = null,
    deleteConfirm = false,
    memorySelectedIdx = -1,
    heroInput = '',
    heroInputActive = false,
    // Everything else passes through as non-state context
    ...rest
  } = overrides;

  const state = {
    view,
    mainFocus,
    selectedIdx,
    focusedAgent,
    showDiagnostics,
    composeMode,
    deleteConfirm,
    memorySelectedIdx,
    heroInput,
    heroInputActive,
  };

  return {
    state,
    dispatch: vi.fn(),
    cols: 120,
    error: null,
    context: { members: [] },
    connectionRetry: vi.fn(),
    allVisibleAgents: [],
    liveAgents: [],
    visibleMemories: [],
    hasLiveAgents: false,
    hasMemories: false,
    mainSelectedAgent: null,
    liveAgentNameCounts: new Map(),
    agents: {
      toolPickerOpen: false,
      setToolPickerOpen: vi.fn(),
      setToolPickerIdx: vi.fn(),
      readyCliAgents: [],
      installedCliAgents: [],
      unavailableCliAgents: [],
      openToolPicker: vi.fn(),
      handleKillAgent: vi.fn(),
      handleRemoveAgent: vi.fn(),
      handleRestartAgent: vi.fn(),
      handleFixLauncher: vi.fn(),
      getManagedToolState: vi.fn().mockReturnValue({}),
      toolPickerIdx: 0,
      handleToolPickerSelect: vi.fn(),
    },
    integrations: {
      integrationIssues: [],
      repairIntegrations: vi.fn(),
    },
    composer: {
      clearCompose: vi.fn(),
      beginTargetedMessage: vi.fn(),
      beginCommandInput: vi.fn(),
      beginMemorySearch: vi.fn(),
      beginMemoryAdd: vi.fn(),
    },
    memory: {
      deleteMemoryItem: vi.fn(),
      setMemoryInput: vi.fn(),
      resetMemorySelection: vi.fn(),
    },
    commandSuggestions: [],
    handleCommandSubmit: vi.fn(),
    handleOpenWebDashboard: vi.fn(),
    navigate: vi.fn(),
    ...rest,
  };
}

function createHandler(overrides = {}) {
  const ctx = buildCtx(overrides);
  return { handler: createInputHandler(ctx), ctx };
}

// ── Tests: createInputHandler ──────────────────────────

describe('createInputHandler', () => {
  describe('narrow terminal guard', () => {
    it('only allows q to quit when terminal is too narrow', () => {
      const { handler, ctx } = createHandler({ cols: 30 });
      handler('x', key());
      expect(ctx.navigate).not.toHaveBeenCalled();

      handler('q', key());
      expect(ctx.navigate).toHaveBeenCalledWith('quit');
    });
  });

  describe('connection retry', () => {
    it('retries connection on r when there is an error', () => {
      const { handler, ctx } = createHandler({ error: 'Something failed', context: null });
      handler('r', key());
      expect(ctx.connectionRetry).toHaveBeenCalled();
    });

    it('retries connection on r when context is null', () => {
      const { handler, ctx } = createHandler({ context: null });
      handler('r', key());
      expect(ctx.connectionRetry).toHaveBeenCalled();
    });
  });

  describe('agent focus view', () => {
    it('escapes back via NAVIGATE_BACK dispatch', () => {
      const { handler, ctx } = createHandler({ view: 'agent-focus' });
      handler('', key({ escape: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE_BACK' });
    });

    it('toggles diagnostics with l key on managed agent', () => {
      const managedAgent = { _managed: true, agent_id: 'a1', status: 'running' };
      const { handler, ctx } = createHandler({
        view: 'agent-focus',
        focusedAgent: managedAgent,
      });
      handler('l', key());
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_DIAGNOSTICS' });
    });

    it('starts targeted message with m on addressable agent', () => {
      const agent = { agent_id: 'a1', status: 'active', _managed: false };
      const { handler, ctx } = createHandler({
        view: 'agent-focus',
        focusedAgent: agent,
      });
      handler('m', key());
      expect(ctx.composer.beginTargetedMessage).toHaveBeenCalledWith(agent);
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE_BACK' });
    });

    it('kills managed agent with x key', () => {
      const agent = { _managed: true, _dead: false, agent_id: 'a1' };
      const { handler, ctx } = createHandler({
        view: 'agent-focus',
        focusedAgent: agent,
      });
      handler('x', key());
      expect(ctx.agents.handleKillAgent).toHaveBeenCalledWith(agent, ctx.liveAgentNameCounts);
    });

    it('removes dead managed agent with x key', () => {
      const agent = { _managed: true, _dead: true, agent_id: 'a1' };
      const mockRemove = vi.fn().mockReturnValue(true);
      const { handler, ctx } = createHandler({
        view: 'agent-focus',
        focusedAgent: agent,
        agents: {
          ...buildCtx().agents,
          handleRemoveAgent: mockRemove,
        },
      });
      handler('x', key());
      expect(mockRemove).toHaveBeenCalledWith(agent, ctx.liveAgentNameCounts);
    });

    it('restarts dead managed agent with r key', () => {
      const agent = { _managed: true, _dead: true, agent_id: 'a1' };
      const mockRestart = vi.fn().mockReturnValue(true);
      const { handler, ctx } = createHandler({
        view: 'agent-focus',
        focusedAgent: agent,
        agents: {
          ...buildCtx().agents,
          handleRestartAgent: mockRestart,
        },
      });
      handler('r', key());
      expect(mockRestart).toHaveBeenCalledWith(agent);
    });
  });

  describe('compose mode', () => {
    it('clears compose on escape', () => {
      const { handler, ctx } = createHandler({
        composeMode: 'targeted',
      });
      handler('', key({ escape: true }));
      expect(ctx.composer.clearCompose).toHaveBeenCalled();
    });

    it('navigates command suggestions with arrow keys', () => {
      const { handler, ctx } = createHandler({
        composeMode: 'command',
        commandSuggestions: [{ name: 'new' }, { name: 'fix' }, { name: 'doctor' }],
      });
      handler('', key({ downArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'COMMAND_SELECT_DOWN' })
      );

      handler('', key({ upArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SELECT_UP' });
    });
  });

  describe('tool picker', () => {
    it('closes on escape', () => {
      const { handler, ctx } = createHandler({
        agents: {
          ...buildCtx().agents,
          toolPickerOpen: true,
          readyCliAgents: [{ id: 'claude-code', name: 'Claude Code' }],
        },
      });
      handler('', key({ escape: true }));
      expect(ctx.agents.setToolPickerOpen).toHaveBeenCalledWith(false);
    });

    it('selects tool on enter', () => {
      const { handler, ctx } = createHandler({
        agents: {
          ...buildCtx().agents,
          toolPickerOpen: true,
          readyCliAgents: [{ id: 'claude-code', name: 'Claude Code' }],
          toolPickerIdx: 0,
        },
      });
      handler('', key({ return: true }));
      expect(ctx.agents.handleToolPickerSelect).toHaveBeenCalledWith(0);
    });
  });

  describe('home view input', () => {
    it('opens tool picker with n key', () => {
      const { handler, ctx } = createHandler({ view: 'home' });
      handler('n', key());
      expect(ctx.agents.openToolPicker).toHaveBeenCalled();
    });

    it('navigates agents list with arrow keys', () => {
      const agents = [{ agent_id: 'a1' }, { agent_id: 'a2' }];
      const { handler, ctx } = createHandler({
        view: 'home',
        mainFocus: 'input',
        allVisibleAgents: agents,
      });
      handler('', key({ downArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SET_MAIN_FOCUS', focus: 'agents' });
    });

    it('moves down within agents list', () => {
      const agents = [{ agent_id: 'a1' }, { agent_id: 'a2' }];
      const { handler, ctx } = createHandler({
        view: 'home',
        mainFocus: 'agents',
        allVisibleAgents: agents,
        selectedIdx: 0,
      });
      handler('', key({ downArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MOVE_SELECTION_DOWN', listLength: agents.length });
    });

    it('moves up in agents list', () => {
      const agents = [{ agent_id: 'a1' }, { agent_id: 'a2' }];
      const { handler, ctx } = createHandler({
        view: 'home',
        mainFocus: 'agents',
        allVisibleAgents: agents,
        selectedIdx: 1,
      });
      handler('', key({ upArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MOVE_SELECTION_UP' });
    });

    it('moves focus to input when at top of agents list', () => {
      const agents = [{ agent_id: 'a1' }];
      const { handler, ctx } = createHandler({
        view: 'home',
        mainFocus: 'agents',
        allVisibleAgents: agents,
        selectedIdx: 0,
      });
      handler('', key({ upArrow: true }));
      // selectedIdx is 0 which is not > 0, so it hits the second branch
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SET_MAIN_FOCUS', focus: 'input' });
    });

    it('kills managed agent with x key from home view', () => {
      const agent = { agent_id: 'a1', _managed: true, _dead: false };
      const { handler, ctx } = createHandler({
        view: 'home',
        mainSelectedAgent: agent,
      });
      handler('x', key());
      expect(ctx.agents.handleKillAgent).toHaveBeenCalledWith(agent, ctx.liveAgentNameCounts);
    });

    it('starts targeted message with m key on addressable agent', () => {
      const agent = { agent_id: 'a1', status: 'active' };
      const { handler, ctx } = createHandler({
        view: 'home',
        mainSelectedAgent: agent,
      });
      handler('m', key());
      expect(ctx.composer.beginTargetedMessage).toHaveBeenCalledWith(agent);
    });

    it('focuses agent on enter with a selected agent', () => {
      const agent = { agent_id: 'a1', _managed: true };
      const { handler, ctx } = createHandler({
        view: 'home',
        mainSelectedAgent: agent,
      });
      handler('', key({ return: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'FOCUS_AGENT', agent });
    });
  });

  describe('sessions view input', () => {
    it('escapes back to home', () => {
      const { handler, ctx } = createHandler({ view: 'sessions' });
      handler('', key({ escape: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE_TO_VIEW', view: 'home' });
    });

    it('navigates list with down arrow', () => {
      const agents = [{ agent_id: 'a1', _managed: true }, { agent_id: 'a2', _managed: true }];
      const { handler, ctx } = createHandler({
        view: 'sessions',
        liveAgents: agents,
        allVisibleAgents: agents,
      });
      handler('', key({ downArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MOVE_SELECTION_DOWN', listLength: agents.length });
    });

    it('kills managed agent with x key', () => {
      const agent = { agent_id: 'a1', _managed: true, _dead: false };
      const { handler, ctx } = createHandler({
        view: 'sessions',
        selectedIdx: 0,
        liveAgents: [agent],
        allVisibleAgents: [agent],
      });
      handler('x', key());
      expect(ctx.agents.handleKillAgent).toHaveBeenCalledWith(agent, ctx.liveAgentNameCounts);
    });

    it('removes dead managed agent with x key', () => {
      const agent = { agent_id: 'a1', _managed: true, _dead: true };
      const { handler, ctx } = createHandler({
        view: 'sessions',
        selectedIdx: 0,
        liveAgents: [agent],
        allVisibleAgents: [agent],
      });
      handler('x', key());
      expect(ctx.agents.handleRemoveAgent).toHaveBeenCalledWith(agent, ctx.liveAgentNameCounts);
    });

    it('restarts dead managed agent with r key', () => {
      const agent = { agent_id: 'a1', _managed: true, _dead: true };
      const mockRestart = vi.fn();
      const { handler } = createHandler({
        view: 'sessions',
        selectedIdx: 0,
        liveAgents: [agent],
        allVisibleAgents: [agent],
        agents: {
          ...buildCtx().agents,
          handleRestartAgent: mockRestart,
        },
      });
      handler('r', key());
      expect(mockRestart).toHaveBeenCalledWith(agent);
    });

    it('focuses agent on enter with valid selection', () => {
      const agent = { agent_id: 'a1', _managed: true };
      const { handler, ctx } = createHandler({
        view: 'sessions',
        selectedIdx: 0,
        liveAgents: [agent],
        allVisibleAgents: [agent],
      });
      handler('', key({ return: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'FOCUS_AGENT', agent });
    });

    it('navigates up with up arrow', () => {
      const agents = [{ agent_id: 'a1', _managed: true }, { agent_id: 'a2', _managed: true }];
      const { handler, ctx } = createHandler({
        view: 'sessions',
        selectedIdx: 1,
        liveAgents: agents,
        allVisibleAgents: agents,
      });
      handler('', key({ upArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MOVE_SELECTION_UP' });
    });
  });

  describe('memory view input', () => {
    it('navigates memory list down with arrows', () => {
      const memories = [{ id: 'm1' }, { id: 'm2' }];
      const { handler, ctx } = createHandler({
        view: 'memory',
        visibleMemories: memories,
      });
      handler('', key({ downArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MEMORY_SELECT_DOWN', listLength: memories.length });
    });

    it('navigates memory list up with arrows', () => {
      const memories = [{ id: 'm1' }, { id: 'm2' }];
      const { handler, ctx } = createHandler({
        view: 'memory',
        visibleMemories: memories,
      });
      handler('', key({ upArrow: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MEMORY_SELECT_UP' });
    });

    it('cancels delete confirm on escape', () => {
      const { handler, ctx } = createHandler({
        view: 'memory',
        deleteConfirm: true,
      });
      handler('', key({ escape: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SET_DELETE_CONFIRM', confirm: false });
    });

    it('escapes to home when not in delete confirm', () => {
      const { handler, ctx } = createHandler({ view: 'memory' });
      handler('', key({ escape: true }));
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE_TO_VIEW', view: 'home' });
    });
  });

  describe('global shortcuts', () => {
    it('navigates to sessions view with s when agents exist', () => {
      const { handler, ctx } = createHandler({
        view: 'home',
        hasLiveAgents: true,
      });
      handler('s', key());
      expect(ctx.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'NAVIGATE_TO_VIEW', view: 'sessions' })
      );
    });

    it('opens web dashboard with w', () => {
      const { handler, ctx } = createHandler({ view: 'home' });
      handler('w', key());
      expect(ctx.handleOpenWebDashboard).toHaveBeenCalled();
    });

    it('toggles memory view with k when memories exist', () => {
      const { handler, ctx } = createHandler({
        view: 'home',
        hasMemories: true,
      });
      handler('k', key());
      expect(ctx.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'NAVIGATE_TO_VIEW', view: 'memory' })
      );
    });

    it('opens command input with / on home view', () => {
      const { handler, ctx } = createHandler({ view: 'home' });
      handler('/', key());
      expect(ctx.composer.beginCommandInput).toHaveBeenCalledWith('');
    });

    it('opens memory search with / on memory view', () => {
      const { handler, ctx } = createHandler({ view: 'memory' });
      handler('/', key());
      expect(ctx.composer.beginMemorySearch).toHaveBeenCalled();
    });

    it('begins memory add with a on memory view', () => {
      const { handler, ctx } = createHandler({ view: 'memory' });
      handler('a', key());
      expect(ctx.composer.beginMemoryAdd).toHaveBeenCalled();
    });

    it('initiates delete with d on memory view with selection', () => {
      const { handler, ctx } = createHandler({
        view: 'memory',
        memorySelectedIdx: 0,
        deleteConfirm: false,
      });
      handler('d', key());
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SET_DELETE_CONFIRM', confirm: true });
    });

    it('confirms delete with d on memory view when already confirming', () => {
      const memories = [{ id: 'm1', text: 'test' }];
      const { handler, ctx } = createHandler({
        view: 'memory',
        visibleMemories: memories,
        memorySelectedIdx: 0,
        deleteConfirm: true,
      });
      handler('d', key());
      expect(ctx.memory.deleteMemoryItem).toHaveBeenCalledWith(memories[0]);
    });

    it('quits with q', () => {
      const { handler, ctx } = createHandler({ view: 'home' });
      handler('q', key());
      expect(ctx.navigate).toHaveBeenCalledWith('quit');
    });

    it('attempts fix with f when fixable tools exist', () => {
      const { handler, ctx } = createHandler({
        view: 'home',
        agents: {
          ...buildCtx().agents,
          unavailableCliAgents: [{ id: 'tool1' }],
          getManagedToolState: vi.fn().mockReturnValue({ recoveryCommand: 'npm install' }),
        },
      });
      handler('f', key());
      expect(ctx.agents.handleFixLauncher).toHaveBeenCalled();
    });

    it('f key does nothing when no fixable tools and no integration issues', () => {
      const { handler, ctx } = createHandler({
        view: 'home',
        agents: {
          ...buildCtx().agents,
          unavailableCliAgents: [],
        },
        integrations: {
          integrationIssues: [],
          repairIntegrations: vi.fn(),
        },
      });
      handler('f', key());
      // Should not call any fix/repair action
      expect(ctx.agents.handleFixLauncher).not.toHaveBeenCalled();
      expect(ctx.integrations.repairIntegrations).not.toHaveBeenCalled();
    });

    it('unrecognized input on home view falls through without effect', () => {
      const { handler, ctx } = createHandler({ view: 'home' });
      handler('z', key());
      // Should not navigate or dispatch anything meaningful
      expect(ctx.navigate).not.toHaveBeenCalled();
    });

    it('opens command input with / on sessions view', () => {
      const { handler, ctx } = createHandler({ view: 'sessions' });
      handler('/', key());
      expect(ctx.composer.beginCommandInput).toHaveBeenCalledWith('');
    });

    it('repairs integrations with f when no fixable tools but integration issues', () => {
      const { handler, ctx } = createHandler({
        view: 'home',
        agents: {
          ...buildCtx().agents,
          unavailableCliAgents: [],
        },
        integrations: {
          integrationIssues: [{ id: 'i1' }],
          repairIntegrations: vi.fn(),
        },
      });
      handler('f', key());
      expect(ctx.integrations.repairIntegrations).toHaveBeenCalled();
    });
  });
});

// ── Tests: createCommandHandler ────────────────────────

describe('createCommandHandler', () => {
  function buildCommandCtx(overrides = {}) {
    return {
      agents: {
        resolveReadyTool: vi.fn().mockReturnValue(null),
        selectedLaunchTool: null,
        readyCliAgents: [],
        canLaunchSelectedTool: false,
        unavailableCliAgents: [],
        getManagedToolState: vi.fn().mockReturnValue({}),
        launchManagedTask: vi.fn(),
        handleFixLauncher: vi.fn(),
        refreshManagedToolStates: vi.fn(),
      },
      integrations: {
        repairIntegrations: vi.fn(),
        refreshIntegrationStatuses: vi.fn(),
      },
      composer: {
        clearCompose: vi.fn(),
        beginTargetedMessage: vi.fn(),
      },
      memory: {
        setMemoryInput: vi.fn(),
      },
      flash: vi.fn(),
      dispatch: vi.fn(),
      handleOpenWebDashboard: vi.fn(),
      liveAgents: [],
      selectedAgent: null,
      isAgentAddressable: vi.fn().mockReturnValue(false),
      ...overrides,
    };
  }

  it('clears compose on empty input', () => {
    const ctx = buildCommandCtx();
    const handler = createCommandHandler(ctx);
    handler('  ');
    expect(ctx.composer.clearCompose).toHaveBeenCalled();
  });

  it('strips leading slash from commands', () => {
    const ctx = buildCommandCtx();
    const handler = createCommandHandler(ctx);
    handler('/help');
    expect(ctx.flash).toHaveBeenCalledWith(
      expect.stringContaining('/new'),
      expect.any(Object)
    );
  });

  describe('/new and /start commands', () => {
    it('launches specified tool if found', () => {
      const tool = { id: 'claude-code', name: 'Claude Code' };
      const ctx = buildCommandCtx({
        agents: {
          ...buildCommandCtx().agents,
          resolveReadyTool: vi.fn().mockReturnValue(tool),
          launchManagedTask: vi.fn(),
        },
      });
      const handler = createCommandHandler(ctx);
      handler('/new claude-code');
      expect(ctx.agents.resolveReadyTool).toHaveBeenCalledWith('claude-code');
      expect(ctx.agents.launchManagedTask).toHaveBeenCalledWith(tool, '');
    });

    it('launches default tool when no argument given', () => {
      const tool = { id: 'claude-code', name: 'Claude Code' };
      const ctx = buildCommandCtx({
        agents: {
          ...buildCommandCtx().agents,
          selectedLaunchTool: tool,
          launchManagedTask: vi.fn(),
        },
      });
      const handler = createCommandHandler(ctx);
      handler('/start');
      expect(ctx.agents.launchManagedTask).toHaveBeenCalledWith(tool, '');
    });

    it('flashes warning when no tools ready', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/new');
      expect(ctx.flash).toHaveBeenCalledWith(
        expect.stringContaining('No tools ready'),
        expect.objectContaining({ tone: 'warning' })
      );
    });
  });

  describe('/fix command', () => {
    it('runs fix launcher when unavailable tools have recovery commands', () => {
      const ctx = buildCommandCtx({
        agents: {
          ...buildCommandCtx().agents,
          unavailableCliAgents: [{ id: 't1' }],
          getManagedToolState: vi.fn().mockReturnValue({ recoveryCommand: 'npm install' }),
          handleFixLauncher: vi.fn(),
        },
      });
      const handler = createCommandHandler(ctx);
      handler('/fix');
      expect(ctx.agents.handleFixLauncher).toHaveBeenCalled();
    });

    it('repairs integrations when no launcher fix available', () => {
      const ctx = buildCommandCtx({
        agents: {
          ...buildCommandCtx().agents,
          unavailableCliAgents: [{ id: 't1' }],
          getManagedToolState: vi.fn().mockReturnValue({}),
        },
      });
      const handler = createCommandHandler(ctx);
      handler('/fix');
      expect(ctx.integrations.repairIntegrations).toHaveBeenCalled();
    });
  });

  describe('/repair command', () => {
    it('calls repairIntegrations', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/repair');
      expect(ctx.integrations.repairIntegrations).toHaveBeenCalled();
    });
  });

  describe('/recheck and /refresh commands', () => {
    it('refreshes tool states and integration statuses', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/recheck');
      expect(ctx.agents.refreshManagedToolStates).toHaveBeenCalledWith({ clearRuntimeFailures: true });
      expect(ctx.integrations.refreshIntegrationStatuses).toHaveBeenCalledWith({ showFlash: true });
    });

    it('also works with /refresh alias', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/refresh');
      expect(ctx.agents.refreshManagedToolStates).toHaveBeenCalled();
    });
  });

  describe('/doctor command', () => {
    it('refreshes integration statuses with flash', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/doctor');
      expect(ctx.integrations.refreshIntegrationStatuses).toHaveBeenCalledWith({ showFlash: true });
    });
  });

  describe('/knowledge and /memory commands', () => {
    it('navigates to memory view', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/knowledge');
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE_TO_VIEW', view: 'memory' });
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'RESET_MEMORY_SELECTION' });
    });

    it('also works with /memory alias', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/memory');
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE_TO_VIEW', view: 'memory' });
    });
  });

  describe('/sessions, /agents, /history commands', () => {
    it('navigates to sessions view', () => {
      const ctx = buildCommandCtx({
        liveAgents: [{ id: 'a1' }],
      });
      const handler = createCommandHandler(ctx);
      handler('/sessions');
      expect(ctx.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'NAVIGATE_TO_VIEW', view: 'sessions', selectedIdx: 0 })
      );
    });

    it('sets selectedIdx to -1 when no live agents', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/agents');
      expect(ctx.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'NAVIGATE_TO_VIEW', view: 'sessions', selectedIdx: -1 })
      );
    });
  });

  describe('/web and /dashboard commands', () => {
    it('opens web dashboard', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/web');
      expect(ctx.handleOpenWebDashboard).toHaveBeenCalled();
    });
  });

  describe('/message command', () => {
    it('begins targeted message for addressable selected agent', () => {
      const agent = { agent_id: 'a1', status: 'active' };
      const ctx = buildCommandCtx({
        selectedAgent: agent,
        isAgentAddressable: vi.fn().mockReturnValue(true),
      });
      const handler = createCommandHandler(ctx);
      handler('/message');
      expect(ctx.composer.beginTargetedMessage).toHaveBeenCalledWith(agent);
    });

    it('flashes warning when no addressable agent selected', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/message');
      expect(ctx.flash).toHaveBeenCalledWith(
        expect.stringContaining('Select a live agent'),
        expect.objectContaining({ tone: 'warning' })
      );
    });
  });

  describe('/help command', () => {
    it('shows help message', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('/help');
      expect(ctx.flash).toHaveBeenCalledWith(
        expect.stringContaining('/new'),
        expect.objectContaining({ tone: 'info' })
      );
    });
  });

  describe('unrecognized command fallback', () => {
    it('launches with selected tool if available and ready', () => {
      const tool = { id: 'claude-code', name: 'Claude Code' };
      const ctx = buildCommandCtx({
        agents: {
          ...buildCommandCtx().agents,
          selectedLaunchTool: tool,
          canLaunchSelectedTool: true,
          launchManagedTask: vi.fn(),
        },
      });
      const handler = createCommandHandler(ctx);
      handler('refactor auth module');
      expect(ctx.agents.launchManagedTask).toHaveBeenCalledWith(tool, 'refactor auth module');
    });

    it('falls back to hero input when no tool available', () => {
      const ctx = buildCommandCtx();
      const handler = createCommandHandler(ctx);
      handler('hello world');
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SET_HERO_INPUT', text: 'hello world', active: true });
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SET_MAIN_FOCUS', focus: 'input' });
    });
  });
});
