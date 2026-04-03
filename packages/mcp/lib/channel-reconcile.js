// Periodic HTTP reconciliation for the channel server.
// Fetches full team context to catch any events the WebSocket missed
// (reconnection gaps, drift). Replaces local state with server truth.
//
// When WebSocket is connected: polls every 60s (safety net).
// When WebSocket is disconnected: polls every 10s (graceful fallback).
//
// CRITICAL: Never console.log — stdio transport.

import { diffState } from '../dist/diff-state.js';

const RECONCILE_INTERVAL_MS = 60_000;
const FALLBACK_POLL_MS = 10_000;

/**
 * @param {object} options
 * @param {object} options.team - teamHandlers instance
 * @param {string} options.teamId
 * @param {() => object|null} options.getLocalContext
 * @param {(ctx: object) => void} options.replaceContext
 * @param {(events: string[]) => void} options.onEvents
 * @param {Map} options.stucknessAlerted
 * @param {() => boolean} options.isWsConnected
 * @param {{ info: Function, error: Function, warn: Function }} options.logger
 */
export function createReconciler({
  team,
  teamId,
  getLocalContext,
  replaceContext,
  onEvents,
  stucknessAlerted,
  isWsConnected,
  logger,
}) {
  let timer = null;
  let stopped = false;
  let consecutiveFailures = 0;

  async function reconcile() {
    try {
      const httpContext = await team.getTeamContext(teamId);
      if (consecutiveFailures > 0) {
        logger.info(`Reconciliation recovered after ${consecutiveFailures} failure(s)`);
      }
      consecutiveFailures = 0;

      const localContext = getLocalContext();
      if (localContext) {
        const events = diffState(localContext, httpContext, stucknessAlerted);
        if (events.length > 0) {
          logger.info(`Reconciliation found ${events.length} missed event(s)`);
          onEvents(events);
        }
      }

      // Replace local state with server truth
      replaceContext(httpContext);
    } catch (err) {
      consecutiveFailures++;
      logger.error(
        `Reconciliation failed (attempt ${consecutiveFailures}): ${err?.message || 'unknown'}`,
      );
    }
  }

  function scheduleNext() {
    if (stopped) return;
    const delay = isWsConnected() ? RECONCILE_INTERVAL_MS : FALLBACK_POLL_MS;
    timer = setTimeout(async () => {
      await reconcile();
      scheduleNext();
    }, delay);
    if (timer.unref) timer.unref();
  }

  function start() {
    stopped = false;
    scheduleNext();
  }

  function stop() {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { start, stop, reconcile };
}
