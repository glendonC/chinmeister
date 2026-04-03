import { api, getApiUrl } from '../api.js';
import { authActions } from './auth.js';
import { teamActions } from './teams.js';
import { applyDelta } from '../../../../shared/dashboard-ws.js';

let activeWs = null;
let reconcileTimer = null;
/** Monotonic generation counter — prevents stale onclose handlers from
 *  restarting polling after a newer connection has replaced them. */
let wsGeneration = 0;

/**
 * Callbacks into the polling module.
 * Set via `setPollingBridge` to avoid circular imports.
 */
let pollingBridge = {
  setState: () => {},
  getState: () => ({}),
  stopPollTimer: () => {},
  restartPolling: () => {},
  poll: () => {},
};

/** Called by the polling module to wire up cross-store coordination. */
export function setPollingBridge(bridge) {
  pollingBridge = bridge;
}

const RECONCILE_MS = 60_000;

/** Close any active WebSocket and its reconciliation timer. */
export function closeWebSocket() {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
  if (activeWs) {
    // Bump generation so the closing socket's onclose handler becomes a no-op
    wsGeneration++;
    try {
      activeWs.close();
    } catch {
      /* best-effort */
    }
    activeWs = null;
  }
}

/**
 * Attempt a WebSocket connection for project (single-team) view.
 * Falls back to polling if WebSocket fails.
 */
export async function connectTeamWebSocket(teamId) {
  const { token } = authActions.getState();
  if (!token || !teamId) return;

  // Close any existing connection before opening a new one
  closeWebSocket();

  // Capture the generation at the start — if it changes, a newer call
  // has superseded this one and we should bail out.
  const gen = ++wsGeneration;

  // Fetch a short-lived ticket — keeps the real token out of the WS URL
  let ticket;
  try {
    const data = await api('POST', '/auth/ws-ticket', null, token);
    ticket = data.ticket;
  } catch {
    return; // polling continues as fallback
  }

  // Guard: auth may have changed while waiting for the ticket
  if (authActions.getState().token !== token) return;

  // Guard: team may have changed while waiting for ticket
  if (teamActions.getState().activeTeamId !== teamId) return;

  // Guard: a newer connectTeamWebSocket call superseded this one
  if (wsGeneration !== gen) return;

  const wsBase = getApiUrl().replace(/^http/, 'ws');
  const agentId = `web-dashboard:${token.slice(0, 8)}`;
  const wsUrl = `${wsBase}/teams/${teamId}/ws?agentId=${encodeURIComponent(agentId)}&ticket=${encodeURIComponent(ticket)}`;

  try {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Stale connection — a newer generation has taken over
      if (wsGeneration !== gen) {
        ws.close();
        return;
      }
      if (teamActions.getState().activeTeamId !== teamId) {
        ws.close();
        return;
      }
      // WebSocket connected — stop polling, start reconciliation
      pollingBridge.stopPollTimer();
      if (reconcileTimer) {
        clearInterval(reconcileTimer);
        reconcileTimer = null;
      }
      reconcileTimer = setInterval(pollingBridge.poll, RECONCILE_MS);
    };

    ws.onmessage = (evt) => {
      if (wsGeneration !== gen) return;
      if (teamActions.getState().activeTeamId !== teamId) return;
      try {
        const event = JSON.parse(evt.data);
        if (event.type === 'context') {
          pollingBridge.setState({
            contextData: event.data,
            contextStatus: 'ready',
            contextTeamId: teamId,
            pollError: null,
            pollErrorData: null,
            lastUpdate: new Date(),
          });
        } else {
          pollingBridge.setState((state) => {
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
      // Only act if this is still the active generation — prevents a
      // replaced connection from interfering with its successor.
      if (wsGeneration !== gen) return;
      activeWs = null;
      if (reconcileTimer) {
        clearInterval(reconcileTimer);
        reconcileTimer = null;
      }
      // Fall back to polling if we're still on this team
      if (teamActions.getState().activeTeamId === teamId) {
        pollingBridge.restartPolling();
      }
    };

    ws.onerror = () => {
      /* onclose fires after */
    };

    activeWs = ws;
  } catch {
    // WebSocket constructor failed — stay on polling
  }
}

// Close WebSocket when auth changes (logout or token swap) to prevent
// connection leaks and stale-token data from arriving.
authActions.subscribe((state, prev) => {
  if (state.token !== prev?.token) {
    closeWebSocket();
  }
});

/** Returns true if a WebSocket is currently open or connecting. */
export function hasActiveWebSocket() {
  return activeWs !== null;
}
