// WebSocket connection management for the MCP server.
// Handles connect, reconnect with exponential backoff, heartbeat pings.
// CRITICAL: Never console.log — stdio transport. Use console.error.

import { createLogger } from './utils/logger.js';
import { getErrorMessage } from './utils/responses.js';
import type { ApiClient } from './team.js';

const log = createLogger('ws');

/** Ping interval to keep DB heartbeat fresh */
export const WS_PING_MS: number = 60_000;
/** Initial delay before first reconnect attempt */
export const INITIAL_RECONNECT_DELAY_MS: number = 1_000;
/** Maximum reconnect backoff cap */
export const MAX_RECONNECT_DELAY_MS: number = 60_000;

/** Shared mutable state that the WebSocket manager reads and writes. */
interface WsManagerState {
  ws: WebSocket | null;
  lastActivity: number;
  shuttingDown: boolean;
}

/** Options for creating a WebSocket manager. */
interface WsManagerOptions {
  /** API client (needs .post() for ws-ticket) */
  client: ApiClient;
  /** Returns the API base URL */
  getApiUrl: () => string;
  /** Team ID to connect to */
  teamId: string;
  /** Agent ID for the connection */
  agentId: string;
  /** Shared mutable state (reads/writes .ws, .lastActivity, .shuttingDown) */
  state: WsManagerState;
}

/** Return type of createWebSocketManager. */
export interface WsManager {
  connect: () => void;
  disconnect: () => void;
}

/**
 * Creates a WebSocket manager for team presence.
 *
 * The connection IS the heartbeat — pings every 60s keep the DB timestamp
 * fresh for SQL queries. Reconnects with exponential backoff on disconnect.
 */
export function createWebSocketManager({
  client,
  getApiUrl,
  teamId,
  agentId,
  state,
}: WsManagerOptions): WsManager {
  let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let lastWsSend = 0;
  let connecting = false;

  function scheduleReconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (state.shuttingDown) return;
    // Jitter: 50-100% of delay to prevent thundering herd on mass reconnect
    const jitteredDelay = Math.round(reconnectDelay * (0.5 + Math.random() * 0.5));
    log.info(`WebSocket disconnected, reconnecting in ${(jitteredDelay / 1000).toFixed(1)}s`, {
      reconnectDelay,
    });
    reconnectTimer = setTimeout(connectWs, jitteredDelay);
    if (reconnectTimer.unref) reconnectTimer.unref();
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  function connectWs(): void {
    if (connecting || state.shuttingDown) return;
    connecting = true;
    reconnectTimer = null;

    client
      .post('/auth/ws-ticket')
      .then(({ ticket }: { ticket: string }) => {
        if (state.shuttingDown) {
          connecting = false;
          return;
        }

        const wsBase = getApiUrl().replace(/^http/, 'ws');
        const wsUrl = `${wsBase}/teams/${teamId}/ws?agentId=${encodeURIComponent(agentId)}&ticket=${encodeURIComponent(ticket)}&role=agent`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = (): void => {
          connecting = false;
          state.ws = ws;
          reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
          log.info('WebSocket connected (presence active)');

          pingTimer = setInterval(() => {
            if (Date.now() - lastWsSend > WS_PING_MS - 5000) {
              try {
                ws.send(JSON.stringify({ type: 'ping', lastToolUseAt: state.lastActivity }));
                lastWsSend = Date.now();
              } catch (err: unknown) {
                log.debug(getErrorMessage(err));
              }
            }
          }, WS_PING_MS);
          if (pingTimer.unref) pingTimer.unref();
        };

        ws.onmessage = (_event: MessageEvent): void => {}; // agent doesn't need broadcasts

        ws.onclose = (_event: CloseEvent): void => {
          connecting = false;
          state.ws = null;
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          scheduleReconnect();
        };

        ws.onerror = (event: Event): void => {
          log.error('WebSocket error: ' + getErrorMessage(event));
        };
      })
      .catch((err: unknown) => {
        connecting = false;
        log.error(getErrorMessage(err));
        scheduleReconnect();
      });
  }

  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    connecting = false;
    if (state.ws) {
      try {
        state.ws.close();
      } catch (err: unknown) {
        log.error('Failed to close WebSocket: ' + getErrorMessage(err));
      }
      state.ws = null;
    }
  }

  return { connect: connectWs, disconnect };
}
