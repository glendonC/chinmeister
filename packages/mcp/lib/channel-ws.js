// Channel WebSocket manager — connects as a watcher to TeamDO.
// Receives delta events, maintains a local TeamContext via applyDelta,
// and notifies the channel server of state changes for diffing.
//
// This is separate from lib/websocket.js (agent role, ignores messages).
// The channel needs watcher role, processes every incoming message,
// and maintains materialized state for conflict/stuckness detection.
//
// CRITICAL: Never console.log — stdio transport.

import { applyDelta, normalizeDashboardDeltaEvent } from '@chinwag/shared/dashboard-ws.js';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

/**
 * @param {object} options
 * @param {object} options.client - API client (.post for ws-ticket)
 * @param {() => string} options.getApiUrl - Returns API base URL
 * @param {string} options.teamId
 * @param {string} options.agentId
 * @param {(prev: object|null, curr: object) => void} options.onContextUpdate
 * @param {{ info: Function, error: Function, warn: Function }} options.logger
 */
export function createChannelWebSocket({
  client,
  getApiUrl,
  teamId,
  agentId,
  onContextUpdate,
  logger,
}) {
  let localContext = null;
  let ws = null;
  let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  let reconnectTimer = null;
  let destroyed = false;
  let connecting = false;

  function connect() {
    if (destroyed || connecting) return;
    connecting = true;
    reconnectTimer = null;

    client
      .post('/auth/ws-ticket')
      .then(({ ticket }) => {
        if (destroyed) {
          connecting = false;
          return;
        }

        const wsBase = getApiUrl().replace(/^http/, 'ws');
        const url = `${wsBase}/teams/${teamId}/ws?agentId=${encodeURIComponent(agentId)}&ticket=${encodeURIComponent(ticket)}&role=watcher`;

        const socket = new WebSocket(url);

        socket.onopen = () => {
          connecting = false;
          ws = socket;
          reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
          logger.info('WebSocket connected (watcher)');
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Initial full context frame sent by TeamDO on connect
            if (data.type === 'context' && data.data) {
              const prev = localContext;
              localContext = data.data;
              onContextUpdate(prev, localContext);
              return;
            }

            // Delta events — apply to local state and notify
            const normalized = normalizeDashboardDeltaEvent(data);
            if (!normalized || !localContext) return;

            const prev = localContext;
            localContext = applyDelta(localContext, normalized) || localContext;
            onContextUpdate(prev, localContext);
          } catch (err) {
            logger.error('WebSocket message parse error: ' + (err.message || err));
          }
        };

        socket.onclose = () => {
          connecting = false;
          ws = null;
          scheduleReconnect();
        };

        socket.onerror = (err) => {
          logger.error('WebSocket error: ' + (err?.message || 'unknown'));
        };
      })
      .catch((err) => {
        connecting = false;
        logger.error('WebSocket ticket fetch failed: ' + (err?.message || 'unknown'));
        scheduleReconnect();
      });
  }

  function scheduleReconnect() {
    if (destroyed || reconnectTimer) return;
    // Jitter: 50-100% of delay to prevent thundering herd on mass reconnect
    const jitteredDelay = Math.round(reconnectDelay * (0.5 + Math.random() * 0.5));
    logger.info(`WebSocket reconnecting in ${(jitteredDelay / 1000).toFixed(1)}s`);
    reconnectTimer = setTimeout(connect, jitteredDelay);
    if (reconnectTimer.unref) reconnectTimer.unref();
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  function disconnect() {
    destroyed = true;
    connecting = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        // closing during shutdown — safe to ignore
      }
      ws = null;
    }
  }

  function getContext() {
    return localContext;
  }

  function setContext(ctx) {
    localContext = ctx;
  }

  function isConnected() {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  return { connect, disconnect, getContext, setContext, isConnected };
}
