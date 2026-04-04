import type { CombinedAgentRow } from './view.js';

// ── Types ──────────────────────────────────────────

export type DashboardView = 'home' | 'sessions' | 'memory' | 'agent-focus';
export type MainFocus = 'input' | 'agents';
export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface DashboardNotice {
  text: string;
  tone: NoticeTone;
}

export interface DashboardState {
  view: DashboardView;
  selectedIdx: number;
  mainFocus: MainFocus;
  heroInput: string;
  heroInputActive: boolean;
  focusedAgent: CombinedAgentRow | null;
  showDiagnostics: boolean;
  notice: DashboardNotice | null;
}

// ── Action Types ───────────────────────────────────
export const NAVIGATE_TO_VIEW = 'NAVIGATE_TO_VIEW' as const;
export const SET_SELECTED_IDX = 'SET_SELECTED_IDX' as const;
export const SET_MAIN_FOCUS = 'SET_MAIN_FOCUS' as const;
export const SET_HERO_INPUT = 'SET_HERO_INPUT' as const;
export const SET_HERO_INPUT_ACTIVE = 'SET_HERO_INPUT_ACTIVE' as const;
export const SET_FOCUSED_AGENT = 'SET_FOCUSED_AGENT' as const;
export const SET_SHOW_DIAGNOSTICS = 'SET_SHOW_DIAGNOSTICS' as const;
export const TOGGLE_DIAGNOSTICS = 'TOGGLE_DIAGNOSTICS' as const;
export const SET_NOTICE = 'SET_NOTICE' as const;
export const CLEAR_NOTICE = 'CLEAR_NOTICE' as const;
export const CLAMP_SELECTION = 'CLAMP_SELECTION' as const;
export const ENTER_AGENT_FOCUS = 'ENTER_AGENT_FOCUS' as const;
export const EXIT_AGENT_FOCUS = 'EXIT_AGENT_FOCUS' as const;

// ── Discriminated Union of Actions ─────────────────

export type DashboardAction =
  | { type: typeof NAVIGATE_TO_VIEW; view: DashboardView }
  | { type: typeof SET_SELECTED_IDX; idx: number | ((prev: number) => number) }
  | { type: typeof SET_MAIN_FOCUS; focus: MainFocus }
  | { type: typeof SET_HERO_INPUT; text: string }
  | { type: typeof SET_HERO_INPUT_ACTIVE; active: boolean }
  | { type: typeof SET_FOCUSED_AGENT; agent: CombinedAgentRow | null }
  | { type: typeof SET_SHOW_DIAGNOSTICS; show: boolean }
  | { type: typeof TOGGLE_DIAGNOSTICS }
  | { type: typeof SET_NOTICE; text: string; tone: NoticeTone }
  | { type: typeof CLEAR_NOTICE; matchText?: string | null }
  | { type: typeof CLAMP_SELECTION; listLength: number }
  | { type: typeof ENTER_AGENT_FOCUS; agent: CombinedAgentRow }
  | { type: typeof EXIT_AGENT_FOCUS };

// ── Initial State ──────────────────────────────────

export function createInitialState(): DashboardState {
  return {
    view: 'home',
    selectedIdx: -1,
    mainFocus: 'input',
    heroInput: '',
    heroInputActive: false,
    focusedAgent: null,
    showDiagnostics: false,
    notice: null,
  };
}

// ── Action Creators ────────────────────────────────

/**
 * Navigate to a dashboard view.
 */
export function navigateToView(view: DashboardView): DashboardAction {
  return { type: NAVIGATE_TO_VIEW, view };
}

/**
 * Set the selected index in the agent/memory list.
 */
export function setSelectedIdx(idx: number | ((prev: number) => number)): DashboardAction {
  return { type: SET_SELECTED_IDX, idx };
}

/**
 * Set which pane has focus (input bar vs agent list).
 */
export function setMainFocus(focus: MainFocus): DashboardAction {
  return { type: SET_MAIN_FOCUS, focus };
}

/**
 * Set the hero input text.
 */
export function setHeroInput(text: string): DashboardAction {
  return { type: SET_HERO_INPUT, text };
}

/**
 * Set whether the hero input is active.
 */
export function setHeroInputActive(active: boolean): DashboardAction {
  return { type: SET_HERO_INPUT_ACTIVE, active };
}

/**
 * Set the currently focused agent (for agent-focus view).
 */
export function setFocusedAgent(agent: CombinedAgentRow | null): DashboardAction {
  return { type: SET_FOCUSED_AGENT, agent };
}

/**
 * Set diagnostics panel visibility.
 */
export function setShowDiagnostics(show: boolean): DashboardAction {
  return { type: SET_SHOW_DIAGNOSTICS, show };
}

/**
 * Toggle diagnostics panel visibility.
 */
export function toggleDiagnostics(): DashboardAction {
  return { type: TOGGLE_DIAGNOSTICS };
}

/**
 * Set a flash notification.
 */
export function setNotice(text: string, tone: NoticeTone = 'info'): DashboardAction {
  return { type: SET_NOTICE, text, tone };
}

/**
 * Clear the flash notification (optionally only if it matches a specific text).
 */
export function clearNotice(matchText: string | null = null): DashboardAction {
  return { type: CLEAR_NOTICE, matchText };
}

/**
 * Clamp the selected index to the list bounds. Resets focus if the list is empty.
 */
export function clampSelection(listLength: number): DashboardAction {
  return { type: CLAMP_SELECTION, listLength };
}

/**
 * Enter agent focus view for a specific agent.
 */
export function enterAgentFocus(agent: CombinedAgentRow): DashboardAction {
  return { type: ENTER_AGENT_FOCUS, agent };
}

/**
 * Exit agent focus view and return to home.
 */
export function exitAgentFocus(): DashboardAction {
  return { type: EXIT_AGENT_FOCUS };
}

// ── Reducer ────────────────────────────────────────

/**
 * Dashboard state reducer.
 */
export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case NAVIGATE_TO_VIEW: {
      const validViews = new Set<DashboardView>(['home', 'sessions', 'memory', 'agent-focus']);
      if (!validViews.has(action.view)) return state;
      return { ...state, view: action.view };
    }

    case SET_SELECTED_IDX: {
      const idx = typeof action.idx === 'function' ? action.idx(state.selectedIdx) : action.idx;
      return { ...state, selectedIdx: idx };
    }

    case SET_MAIN_FOCUS:
      return { ...state, mainFocus: action.focus };

    case SET_HERO_INPUT:
      return { ...state, heroInput: action.text };

    case SET_HERO_INPUT_ACTIVE:
      return { ...state, heroInputActive: action.active };

    case SET_FOCUSED_AGENT:
      return { ...state, focusedAgent: action.agent };

    case SET_SHOW_DIAGNOSTICS:
      return { ...state, showDiagnostics: action.show };

    case TOGGLE_DIAGNOSTICS:
      return { ...state, showDiagnostics: !state.showDiagnostics };

    case SET_NOTICE:
      return { ...state, notice: { text: action.text, tone: action.tone } };

    case CLEAR_NOTICE:
      if (action.matchText && state.notice?.text !== action.matchText) return state;
      return { ...state, notice: null };

    case CLAMP_SELECTION: {
      if (action.listLength === 0) {
        const updates: Partial<DashboardState> = {};
        if (state.selectedIdx !== -1) updates.selectedIdx = -1;
        if (state.mainFocus === 'agents') updates.mainFocus = 'input';
        return Object.keys(updates).length > 0 ? { ...state, ...updates } : state;
      }
      if (state.selectedIdx >= action.listLength) {
        return { ...state, selectedIdx: action.listLength - 1 };
      }
      return state;
    }

    case ENTER_AGENT_FOCUS:
      return {
        ...state,
        focusedAgent: action.agent,
        view: 'agent-focus',
        showDiagnostics: false,
      };

    case EXIT_AGENT_FOCUS:
      return {
        ...state,
        view: 'home',
        focusedAgent: null,
        showDiagnostics: false,
      };

    default:
      return state;
  }
}
