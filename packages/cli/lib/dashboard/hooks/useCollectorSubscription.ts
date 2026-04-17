/**
 * Subscribe to managed-process exits and run post-session analytics collection.
 *
 * The collectors in packages/cli/lib/process/conversation-collector.ts need a
 * config, teamId, and sessionId to upload. The MCP sidecar running inside the
 * agent process owns the sessionId; when it exits it writes a completion
 * record (packages/shared/session-registry.ts) that this hook reads by
 * agentId. Without the handoff, sessionId is lost and collectors silently
 * skip — which is the state the analytics pipeline was stuck in before.
 *
 * Collection runs asynchronously. It must never block the registry's exit
 * callbacks, and any failure is swallowed — logs and tokens are nice-to-have,
 * not load-bearing for the agent lifecycle.
 */
import { useEffect } from 'react';
import { readCompletedSession, deleteCompletedSession } from '@chinwag/shared/session-registry.js';
import { createLogger } from '@chinwag/shared';
import { onProcessExit } from '../../process/registry.js';
import {
  collectConversation,
  collectTokenUsage,
  collectToolCalls,
} from '../../process/conversation-collector.js';
import type { ChinwagConfig } from '../../config.js';
import type { ManagedProcess } from '../../process/types.js';

const log = createLogger('collector-subscription');

interface UseCollectorSubscriptionParams {
  config: ChinwagConfig | null;
  teamId: string | null;
}

/**
 * Max time to wait for the MCP sidecar to flush its completion record.
 * MCP writes the file during its own cleanup path, which runs in parallel
 * with the dashboard observing the parent pty exit. A short retry covers
 * the race without blocking meaningfully.
 */
const COMPLETION_POLL_DELAYS_MS = [0, 250, 1000];

interface RunCollectorsOverrides {
  readCompletedSessionFn?: typeof readCompletedSession;
  deleteCompletedSessionFn?: typeof deleteCompletedSession;
  collectConversationFn?: typeof collectConversation;
  collectTokenUsageFn?: typeof collectTokenUsage;
  collectToolCallsFn?: typeof collectToolCalls;
  /** Poll delays used for integration tests; defaults to production values. */
  pollDelaysMs?: number[];
  /** Custom sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
}

export async function runCollectorsForProcess(
  proc: ManagedProcess,
  config: ChinwagConfig,
  overrides: RunCollectorsOverrides = {},
): Promise<void> {
  const readFn = overrides.readCompletedSessionFn || readCompletedSession;
  const deleteFn = overrides.deleteCompletedSessionFn || deleteCompletedSession;
  const collectConv = overrides.collectConversationFn || collectConversation;
  const collectTok = overrides.collectTokenUsageFn || collectTokenUsage;
  const collectCalls = overrides.collectToolCallsFn || collectToolCalls;
  const delays = overrides.pollDelaysMs || COMPLETION_POLL_DELAYS_MS;
  const sleep = overrides.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const resolvedAgentId = proc.agentId;
  if (!resolvedAgentId) return;

  let completed = null;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    completed = readFn(resolvedAgentId);
    if (completed) break;
  }
  if (!completed) {
    // No sessionId available — the MCP either didn't get one or hasn't flushed
    // yet. Skip collection silently; the dashboard's other signals (edits,
    // outcomes, heatmap) still land via the MCP heartbeat path.
    return;
  }

  const teamId = completed.teamId || proc.teamId || null;
  const sessionId = completed.sessionId;
  const procForCollectors: ManagedProcess = {
    ...proc,
    teamId,
    sessionId,
    startedAt: completed.startedAt || proc.startedAt,
  };

  await Promise.all([
    collectConv(procForCollectors, config, teamId, sessionId).catch((err) => {
      log.warn(`collectConversation failed: ${err}`);
    }),
    collectTok(procForCollectors, config, teamId, sessionId).catch((err) => {
      log.warn(`collectTokenUsage failed: ${err}`);
    }),
    collectCalls(procForCollectors, config, teamId, sessionId).catch((err) => {
      log.warn(`collectToolCalls failed: ${err}`);
    }),
  ]);

  deleteFn(resolvedAgentId);
}

export function useCollectorSubscription({ config, teamId }: UseCollectorSubscriptionParams): void {
  useEffect(() => {
    if (!config || !teamId) return undefined;

    const unsubscribe = onProcessExit((proc) => {
      void runCollectorsForProcess(proc, config);
    });

    return unsubscribe;
  }, [config, teamId]);
}
