// Dashboard state management — split into domain sub-reducers for testability.
// Each sub-reducer handles its own action types and returns early on no-match,
// so composition is a simple fall-through chain.

// ── Initial state ──────────────────────────────────

export const initialViewState = {
  view: 'home',
  mainFocus: 'input',
  selectedIdx: -1,
  focusedAgent: null,
  showDiagnostics: false,
  heroInput: '',
  heroInputActive: false,
};

export const initialComposeState = {
  composeMode: null,
  composeText: '',
  composeTarget: null,
  composeTargetLabel: null,
  commandSelectedIdx: 0,
};

export const initialMemoryState = {
  memorySelectedIdx: -1,
  deleteConfirm: false,
  deleteMsg: null,
};

export const initialNoticeState = {
  notice: null,
};

export const initialState = {
  ...initialViewState,
  ...initialComposeState,
  ...initialMemoryState,
  ...initialNoticeState,
};

// ── View navigation ─────────────────────────────────

export function viewReducer(state, action) {
  switch (action.type) {
    case 'NAVIGATE_TO_VIEW': {
      const next = { ...state, view: action.view };
      if (action.view === 'home') {
        next.selectedIdx = -1;
        next.mainFocus = 'input';
      }
      if (action.selectedIdx !== undefined) {
        next.selectedIdx = action.selectedIdx;
      }
      return next;
    }
    case 'NAVIGATE_BACK':
      return {
        ...state,
        view: 'home',
        focusedAgent: null,
        showDiagnostics: false,
        selectedIdx: -1,
        mainFocus: 'input',
      };
    case 'SET_MAIN_FOCUS':
      return { ...state, mainFocus: action.focus };
    case 'SELECT_AGENT':
      return { ...state, selectedIdx: action.idx };
    case 'MOVE_SELECTION_DOWN': {
      const current = state.selectedIdx < 0 ? 0 : state.selectedIdx + 1;
      return { ...state, selectedIdx: Math.min(current, action.listLength - 1) };
    }
    case 'MOVE_SELECTION_UP': {
      const next = state.selectedIdx - 1;
      if (next < 0) {
        return { ...state, mainFocus: 'input', selectedIdx: -1 };
      }
      return { ...state, selectedIdx: next };
    }
    case 'FOCUS_AGENT':
      return {
        ...state,
        focusedAgent: action.agent,
        view: 'agent-focus',
        showDiagnostics: false,
      };
    case 'UNFOCUS_AGENT':
      return {
        ...state,
        view: 'home',
        focusedAgent: null,
        showDiagnostics: false,
        selectedIdx: -1,
        mainFocus: 'input',
      };
    case 'TOGGLE_DIAGNOSTICS':
      return { ...state, showDiagnostics: !state.showDiagnostics };
    case 'CLAMP_SELECTION': {
      if (action.listLength === 0) {
        return {
          ...state,
          selectedIdx: -1,
          mainFocus: state.mainFocus === 'agents' ? 'input' : state.mainFocus,
        };
      }
      if (state.selectedIdx >= action.listLength) {
        return { ...state, selectedIdx: action.listLength - 1 };
      }
      return state;
    }
    case 'SET_HERO_INPUT': {
      const next = { ...state, heroInput: action.text };
      if (action.active !== undefined) {
        next.heroInputActive = action.active;
      }
      return next;
    }
    default:
      return null; // not handled
  }
}

// ── Compose ─────────────────────────────────────────

export function composeReducer(state, action) {
  switch (action.type) {
    case 'BEGIN_COMMAND':
      return {
        ...state,
        composeMode: 'command',
        composeText: action.initialText || '',
        commandSelectedIdx: 0,
      };
    case 'BEGIN_TARGETED_MESSAGE':
      return {
        ...state,
        composeMode: 'targeted',
        composeTarget: action.target,
        composeTargetLabel: action.targetLabel,
        composeText: '',
      };
    case 'BEGIN_MEMORY_SEARCH':
      return { ...state, composeMode: 'memory-search', composeText: '' };
    case 'BEGIN_MEMORY_ADD':
      return { ...state, composeMode: 'memory-add', composeText: '' };
    case 'CLEAR_COMPOSE':
      return {
        ...state,
        composeMode: null,
        composeText: '',
        composeTarget: null,
        composeTargetLabel: null,
        commandSelectedIdx: 0,
      };
    case 'SET_COMPOSE_TEXT':
      return { ...state, composeText: action.text };
    case 'COMMAND_SELECT_DOWN':
      return {
        ...state,
        commandSelectedIdx: Math.min(state.commandSelectedIdx + 1, action.maxIdx),
      };
    case 'COMMAND_SELECT_UP':
      return { ...state, commandSelectedIdx: Math.max(state.commandSelectedIdx - 1, 0) };
    case 'RESET_COMMAND_SELECTION':
      return { ...state, commandSelectedIdx: 0 };
    default:
      return null;
  }
}

// ── Memory UI ───────────────────────────────────────

export function memoryReducer(state, action) {
  switch (action.type) {
    case 'MEMORY_SELECT_DOWN':
      return {
        ...state,
        memorySelectedIdx: Math.min(state.memorySelectedIdx + 1, action.listLength - 1),
        deleteConfirm: false,
      };
    case 'MEMORY_SELECT_UP':
      return {
        ...state,
        memorySelectedIdx: state.memorySelectedIdx <= 0 ? -1 : state.memorySelectedIdx - 1,
        deleteConfirm: false,
      };
    case 'RESET_MEMORY_SELECTION':
      return { ...state, memorySelectedIdx: -1, deleteConfirm: false };
    case 'CLAMP_MEMORY_SELECTION': {
      if (state.memorySelectedIdx >= action.listLength) {
        return { ...state, memorySelectedIdx: action.listLength > 0 ? action.listLength - 1 : -1 };
      }
      return state;
    }
    case 'SET_DELETE_CONFIRM':
      return { ...state, deleteConfirm: action.confirm };
    case 'SET_DELETE_MSG':
      return { ...state, deleteMsg: action.msg };
    default:
      return null;
  }
}

// ── Notification ────────────────────────────────────

export function noticeReducer(state, action) {
  switch (action.type) {
    case 'FLASH':
      return { ...state, notice: { text: action.text, tone: action.tone } };
    case 'CLEAR_NOTICE':
      if (state.notice?.text === action.text) {
        return { ...state, notice: null };
      }
      return state;
    default:
      return null;
  }
}

// ── Root reducer ────────────────────────────────────
// Delegates to each domain reducer in order; first match wins.

const subReducers = [viewReducer, composeReducer, memoryReducer, noticeReducer];

export function dashboardReducer(state, action) {
  for (const reducer of subReducers) {
    const result = reducer(state, action);
    if (result !== null) return result;
  }
  return state;
}
