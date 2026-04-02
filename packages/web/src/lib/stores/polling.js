import { createStore, useStore } from 'zustand';
import { api, getApiUrl } from '../api.js';
import { authActions } from './auth.js';
import { teamActions } from './teams.js';
import { requestRefresh, setRefreshHandler } from './refresh.js';
import { applyDelta } from '../../../../shared/dashboard-ws.js';
import { dashboardSummarySchema, teamContextSchema, validateResponse } from '../apiSchemas.js';

const POLL_MS = 5000;
const SLOW_POLL_MS = 30000;
const RECONCILE_MS = 60_000;

// Internal state encapsulated in a single resettable object.
// Keeps timer/WS refs out of the Zustand store (they're not UI state)
// while making them testable and preventing stale closures.
const _internal = {
  pollTimer: null,
  consecutiveFailures: 0,
  activeWs: null,
  reconcileTimer: null,
  abortController: null,
};

const pollingStore = createStore((set, get) => ({
  dashboardData: null,
  dashboardStatus: 'idle',
  contextData: null,
  contextStatus: 'idle',
  contextTeamId: null,
  pollError: null,
  pollErrorData: null,
  lastUpdate: null,
}));

/** Poll the cross-project overview (no active team selected). */
async function pollOverview(signal, token) {
  pollingStore.setState((state) => ({
    contextData: null,
    contextTeamId: null,
    contextStatus: 'idle',
    dashboardStatus: state.dashboardData ? state.dashboardStatus : 'loading',
  }));
  const raw = await api('GET', '/me/dashboard', null, token);
  if (signal?.aborted) return;
  const data = validateResponse(dashboardSummarySchema, raw, 'dashboard');
  if (data.failed_teams?.length > 0) {
    await teamActions.loadTeams();
  }
  if (teamActions.getState().activeTeamId !== null) return;
  pollingStore.setState({
    dashboardData: data,
    dashboardStatus: 'ready',
    contextData: null,
    contextStatus: 'idle',
    contextTeamId: null,
  });
}

/** Poll a single project's team context. */
async function pollProject(signal, token, teamId) {
  pollingStore.setState((state) => {
    const sameTeam = state.contextTeamId === teamId;
    return {
      dashboardData: null,
      dashboardStatus: 'idle',
      contextData: sameTeam ? state.contextData : null,
      contextStatus: sameTeam && state.contextData ? state.contextStatus : 'loading',
      contextTeamId: teamId,
    };
  });
  await teamActions.ensureJoined(teamId);
  if (signal?.aborted) return;
  const raw = await api('GET', `/teams/${teamId}/context`, null, token);
  if (signal?.aborted || teamActions.getState().activeTeamId !== teamId) return;
  const data = validateResponse(teamContextSchema, raw, 'context');
  pollingStore.setState({
    contextData: data,
    contextStatus: 'ready',
    contextTeamId: teamId,
    dashboardData: null,
    dashboardStatus: 'idle',
  });
}

/** Single poll cycle. Routes to overview or project poller based on active team. */
async function poll() {
  const signal = _internal.abortController?.signal;
  const snapshotTeamId = teamActions.getState().activeTeamId;
  const { token } = authActions.getState();
  if (!token) return;

  try {
    if (snapshotTeamId === null) {
      await pollOverview(signal, token);
    } else {
      await pollProject(signal, token, snapshotTeamId);
    }

    pollingStore.setState({ pollError: null, pollErrorData: null, lastUpdate: new Date() });

    if (_internal.consecutiveFailures > 0) {
      _internal.consecutiveFailures = 0;
      restartPolling();
    }
  } catch (err) {
    if (err.status === 401) {
      authActions.logout();
      stopPolling();
      return;
    }
    if (teamActions.getState().activeTeamId !== snapshotTeamId) return;
    if (snapshotTeamId === null && err?.data?.failed_teams?.length > 0) {
      await teamActions.loadTeams();
    }
    _internal.consecutiveFailures++;
    const pollError = formatError(err);
    const pollErrorData = err?.data || null;
    if (snapshotTeamId === null) {
      pollingStore.setState((state) => ({
        pollError,
        pollErrorData,
        dashboardStatus: state.dashboardData ? 'stale' : 'error',
        contextData: null,
        contextStatus: 'idle',
        contextTeamId: null,
      }));
    } else {
      pollingStore.setState((state) => {
        const hasSnapshot = state.contextTeamId === snapshotTeamId && !!state.contextData;
        return {
          pollError,
          pollErrorData,
          dashboardData: null,
          dashboardStatus: 'idle',
          contextStatus: hasSnapshot ? 'stale' : 'error',
          contextTeamId: snapshotTeamId,
        };
      });
    }
    if (_internal.consecutiveFailures >= 3) restartPolling();
  }
}

setRefreshHandler(poll);

function restartPolling() {
  stopPolling();
  const delay = _internal.consecutiveFailures >= 3 ? SLOW_POLL_MS : POLL_MS;
  _internal.pollTimer = setInterval(poll, delay);
}

/** Close any active WebSocket and its reconciliation timer. */
function closeWebSocket() {
  if (_internal.reconcileTimer) {
    clearInterval(_internal.reconcileTimer);
    _internal.reconcileTimer = null;
  }
  if (_internal.activeWs) {
    try {
      _internal.activeWs.close();
    } catch {
      /* ignore close errors */
    }
    _internal.activeWs = null;
  }
}

/**
 * Attempt a WebSocket connection for project (single-team) view.
 * Falls back to polling if WebSocket fails.
 */
async function connectTeamWebSocket(teamId) {
  const { token } = authActions.getState();
  if (!token || !teamId) return;

  // Fetch a short-lived ticket — keeps the real token out of the WS URL
  let ticket;
  try {
    const data = await api('POST', '/auth/ws-ticket', null, token);
    ticket = data.ticket;
  } catch {
    return; // polling continues as fallback
  }

  // Team may have changed while waiting for ticket
  if (teamActions.getState().activeTeamId !== teamId) return;

  const wsBase = getApiUrl().replace(/^http/, 'ws');
  const agentId = `web-dashboard:${token.slice(0, 8)}`;
  const wsUrl = `${wsBase}/teams/${teamId}/ws?agentId=${encodeURIComponent(agentId)}&ticket=${encodeURIComponent(ticket)}`;

  try {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (teamActions.getState().activeTeamId !== teamId) {
        ws.close();
        return;
      }
      // WebSocket connected — stop polling, start reconciliation
      if (_internal.pollTimer) {
        clearInterval(_internal.pollTimer);
        _internal.pollTimer = null;
      }
      if (_internal.reconcileTimer) {
        clearInterval(_internal.reconcileTimer);
        _internal.reconcileTimer = null;
      }
      _internal.reconcileTimer = setInterval(poll, RECONCILE_MS);
    };

    ws.onmessage = (evt) => {
      if (teamActions.getState().activeTeamId !== teamId) return;
      try {
        const event = JSON.parse(evt.data);
        if (event.type === 'context') {
          pollingStore.setState({
            contextData: validateResponse(teamContextSchema, event.data, 'ws-context'),
            contextStatus: 'ready',
            contextTeamId: teamId,
            pollError: null,
            pollErrorData: null,
            lastUpdate: new Date(),
          });
        } else {
          pollingStore.setState((state) => {
            if (state.contextTeamId !== teamId || !state.contextData) return state;
            return {
              contextData: applyDelta(state.contextData, event),
              lastUpdate: new Date(),
            };
          });
        }
      } catch (e) {
        console.warn('[chinwag] Malformed WS event:', e.message);
      }
    };

    ws.onclose = () => {
      _internal.activeWs = null;
      if (_internal.reconcileTimer) {
        clearInterval(_internal.reconcileTimer);
        _internal.reconcileTimer = null;
      }
      // Fall back to polling if we're still on this team
      if (teamActions.getState().activeTeamId === teamId) {
        restartPolling();
      }
    };

    ws.onerror = () => {
      /* onclose fires after */
    };

    _internal.activeWs = ws;
  } catch {
    // WebSocket constructor failed — stay on polling
  }
}

function formatError(err) {
  if (typeof err === 'string') return err;
  const msg = err?.message || 'Something went wrong';
  if (err?.status === 408) return 'Request timed out. Try again.';
  if (msg.includes('Failed to fetch') || err?.name === 'TypeError') {
    return 'Cannot reach server. Check your connection.';
  }
  return msg;
}

/** Start polling. Attempts WebSocket for project view, falls back to polling. */
export function startPolling() {
  stopPolling();
  _internal.abortController = new AbortController();
  poll(); // immediate first poll

  const { activeTeamId } = teamActions.getState();
  if (activeTeamId) {
    // Project view — try WebSocket, polling runs as fallback until WS connects
    const delay = _internal.consecutiveFailures >= 3 ? SLOW_POLL_MS : POLL_MS;
    _internal.pollTimer = setInterval(poll, delay);
    connectTeamWebSocket(activeTeamId);
  } else {
    // Overview — polling only (aggregates across all teams, no single-team WS)
    const delay = _internal.consecutiveFailures >= 3 ? SLOW_POLL_MS : POLL_MS;
    _internal.pollTimer = setInterval(poll, delay);
  }
}

/** Stop polling and close WebSocket. */
export function stopPolling() {
  if (_internal.abortController) {
    _internal.abortController.abort();
    _internal.abortController = null;
  }
  if (_internal.pollTimer) {
    clearInterval(_internal.pollTimer);
    _internal.pollTimer = null;
  }
  closeWebSocket();
}

/** Reset all polling state (call on logout to prevent stale data on re-login). */
export function resetPollingState() {
  stopPolling();
  _internal.consecutiveFailures = 0;
  pollingStore.setState({
    dashboardData: null,
    dashboardStatus: 'idle',
    contextData: null,
    contextStatus: 'idle',
    contextTeamId: null,
    pollError: null,
    pollErrorData: null,
    lastUpdate: null,
  });
}

// Pause polling when tab is hidden, resume when visible.
// Guard prevents duplicate listeners on HMR re-evaluation.
let _visibilityListenerAttached = false;
if (typeof document !== 'undefined' && !_visibilityListenerAttached) {
  _visibilityListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else if (authActions.getState().token) {
      startPolling();
    }
  });
}

/** Force an immediate poll cycle (use after mutations to refresh data). */
export function forceRefresh() {
  requestRefresh();
}

/** React hook — use inside components */
export function usePollingStore(selector) {
  return useStore(pollingStore, selector);
}

/** Direct access — use outside components and in tests */
export const pollingActions = {
  getState: () => pollingStore.getState(),
  subscribe: pollingStore.subscribe,
};
