// Team Durable Object -- one instance per team.
// Manages team membership, activity tracking, file conflict detection,
// shared project memory, and session history (observability).
//
// This file is a facade. The DO class declares the public RPC surface
// (each `async methodName(...)` IS the contract callers stub against),
// owns instance state that cannot move out of the class boundary
// (schema readiness, context cache, heartbeat debounce timestamps,
// cleanup clock), and routes every request to a per-domain handler.
//
// Three layers sit behind the class:
//   - domain modules with pure SQL logic (schema, context, identity,
//     cleanup, membership, activity, sessions, conversations, memory,
//     consolidation, formation, categories, locks, messages, commands,
//     analytics/*)
//   - presence / broadcast / telemetry / context-cache / runtime
//     helpers for cross-cutting infrastructure
//   - rpc-context.ts + rpc-*.ts handler modules that translate
//     "RPC call from the worker" into "domain-module call + side
//     effects (broadcast, metric)". Every class method delegates here
//
// Three methods stay inline because they close over instance state the
// handler modules cannot sensibly carry:
//   heartbeat    -- owns #lastHeartbeatBroadcast debounce Map
//   getContext   -- reads #contextCache, hot path; cache layering is
//                   clearer as inline code than as ctx-threaded calls
//   recordTelemetry -- three lines, auth-lax (route already authed)
//
// Cloudflare's Hibernation API dispatches fetch / webSocketMessage /
// webSocketClose / webSocketError by reflection against the class, so
// those method names are load-bearing; their bodies delegate to
// websocket.ts.

import { DurableObject } from 'cloudflare:workers';
import type { Env, DOResult, DOError, TeamContext } from '../../types.js';
import { isDOError } from '../../lib/errors.js';

import { ensureSchema } from './schema.js';
import { queryTeamContext } from './context.js';
import { resolveOwnedAgentId } from './identity.js';
import { runCleanup, collectHandleBackfills, type OrphanSummary } from './cleanup.js';
import { heartbeat as heartbeatFn } from './membership.js';
import type { SearchFilters, BatchDeleteFilter } from './memory.js';
import type { FormationRecommendation } from './formation.js';
import type { ToolCallInput, CommitInput } from './sessions.js';
import type { ConversationEventInput } from './conversations.js';
import type {
  ConversationAnalytics,
  SessionConversationStats,
} from '@chinmeister/shared/contracts/conversation.js';
import {
  CONTEXT_CACHE_TTL_MS,
  CLEANUP_INTERVAL_MS,
  HEARTBEAT_BROADCAST_DEBOUNCE_MS,
} from '../../lib/constants.js';
import {
  getConnectedAgentIds,
  getAllConnectedMemberIds,
  getAvailableSpawnTools,
  hasExecutorConnected,
} from './presence.js';
import { broadcastToWatchers, broadcastToExecutors } from './broadcast.js';
import { recordMetric as recordMetricFn } from './telemetry.js';
import { ContextCache } from './context-cache.js';
import { handleFetch, handleMessage, handleClose, handleError, type WsCtx } from './websocket.js';
import { type RpcCtx, withMember as withMemberFn } from './rpc-context.js';
import { joinRpc, leaveRpc } from './rpc-membership.js';
import { updateActivityRpc, checkConflictsRpc, reportFileRpc } from './rpc-activity.js';
import { sendMessageRpc, getMessagesRpc } from './rpc-messages.js';
import { submitCommandRpc, getCommandsRpc } from './rpc-commands.js';
import {
  startSessionRpc,
  endSessionRpc,
  recordEditRpc,
  reportOutcomeRpc,
  getHistoryRpc,
  getEditHistoryRpc,
  enrichModelRpc,
  recordTokenUsageRpc,
  recordToolCallsRpc,
  recordCommitsRpc,
} from './rpc-sessions.js';
import {
  recordConversationEventsRpc,
  getConversationRpc,
  getConversationAnalyticsRpc,
  getSessionConversationStatsRpc,
} from './rpc-conversations.js';
import {
  saveMemoryRpc,
  searchMemoriesRpc,
  updateMemoryRpc,
  deleteMemoryRpc,
  deleteMemoriesBatchRpc,
  runConsolidationRpc,
  listConsolidationProposalsRpc,
  applyConsolidationProposalRpc,
  rejectConsolidationProposalRpc,
  unmergeMemoryRpc,
  runFormationOnRecentRpc,
  runFormationOnMemoryRpc,
  listFormationObservationsRpc,
} from './rpc-memory.js';
import {
  createCategoryRpc,
  listCategoriesRpc,
  getCategoryNamesRpc,
  updateCategoryRpc,
  deleteCategoryRpc,
  getPromotableTagsRpc,
} from './rpc-categories.js';
import {
  claimFilesRpc,
  checkFileConflictsRpc,
  releaseFilesRpc,
  getLockedFilesRpc,
} from './rpc-locks.js';
import {
  getAnalyticsRpc,
  getSessionsInRangeRpc,
  getAnalyticsForOwnerRpc,
  getSummaryRpc,
  getBillingBlocksRpc,
} from './rpc-analytics.js';
import { getDB } from '../../lib/env.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('TeamDO');

export class TeamDO extends DurableObject<Env> {
  sql: SqlStorage;
  #schemaReady = false;
  #lastCleanup = 0;
  #lastHeartbeatBroadcast = new Map<string, number>();

  #contextCache = new ContextCache<TeamContext & { ok: true }>(CONTEXT_CACHE_TTL_MS);

  #transact: <T>(fn: () => T) => T;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.#transact = <T>(fn: () => T): T => ctx.storage.transactionSync(fn);
  }

  // -- Schema --

  #ensureSchema(): void {
    ensureSchema(this.sql, this.#schemaReady, this.#transact);
    this.#schemaReady = true;
  }

  // -- WebSocket support (Hibernation API) --
  // Three roles: 'agent' (MCP servers -- connection IS presence),
  // 'daemon' (background services -- persistent, no user interaction), and
  // 'watcher' (dashboards -- observe only, no presence signal).
  // Tags: [resolvedAgentId, 'role:agent|daemon|watcher']

  async fetch(request: Request): Promise<Response> {
    return handleFetch(this.#wsCtx(), request);
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    return handleMessage(this.#wsCtx(), ws, rawMessage);
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    return handleClose(this.#wsCtx(), ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    return handleError(this.#wsCtx(), ws);
  }

  /** Dependency bag for the WebSocket handlers — rebuilt per call so closures
   *  stay tied to live class state. Cheap: just a literal. */
  #wsCtx(): WsCtx {
    return {
      sql: this.sql,
      ctx: this.ctx,
      ensureSchema: () => this.#ensureSchema(),
      transact: this.#transact,
      resolveOwnedAgentId: (id, ownerId) => this.#resolveOwnedAgentId(id, ownerId),
      broadcastToWatchers: (event, opts) => this.#broadcastToWatchers(event, opts),
      getContext: (agentId) => this.getContext(agentId),
      lastHeartbeatBroadcast: this.#lastHeartbeatBroadcast,
    };
  }

  /** Dependency bag for RPC handlers. Same per-call literal pattern as
   *  `#wsCtx()` — keeps closures tied to live class state. */
  #rpcCtx(): RpcCtx {
    return {
      sql: this.sql,
      env: this.env,
      ensureSchema: () => this.#ensureSchema(),
      transact: this.#transact,
      resolveOwnedAgentId: (id, ownerId) => this.#resolveOwnedAgentId(id, ownerId),
      broadcastToWatchers: (event, opts) => this.#broadcastToWatchers(event, opts),
      broadcastToExecutors: (event) => this.#broadcastToExecutors(event),
      recordMetric: (metric) => this.#recordMetric(metric),
      getConnectedAgentIds: () => this.#getConnectedAgentIds(),
      hasExecutorConnected: () => this.#hasExecutorConnected(),
      lastHeartbeatBroadcast: this.#lastHeartbeatBroadcast,
      maybeCleanup: () => this.#maybeCleanup(),
    };
  }

  // -- Internal helpers --

  /** Agent IDs with an active 'role:agent' WebSocket connection. */
  #getConnectedAgentIds(): Set<string> {
    return getConnectedAgentIds(this.ctx);
  }

  /** All member IDs with any active WebSocket (agent, watcher, daemon).
   *  Used for cleanup eviction protection — any connected socket keeps
   *  the member row alive regardless of role. */
  #getAllConnectedMemberIds(): Set<string> {
    return getAllConnectedMemberIds(this.ctx);
  }

  #broadcastToWatchers(event: Record<string, unknown>, { invalidateCache = true } = {}): void {
    broadcastToWatchers(this.ctx, event, {
      invalidateCache: invalidateCache ? () => this.#contextCache.invalidate() : undefined,
    });
  }

  // -- Daemon command relay helpers --

  #broadcastToExecutors(event: Record<string, unknown>): void {
    broadcastToExecutors(this.ctx, event);
  }

  #hasExecutorConnected(): boolean {
    return hasExecutorConnected(this.ctx);
  }

  /** Collect available spawn tools from all connected daemon WebSocket tags. */
  #getAvailableSpawnTools(): string[] {
    return getAvailableSpawnTools(this.ctx);
  }

  // Evict stale members and prune old sessions -- at most once per minute.
  // Three write-through paths feed DatabaseDO.updateUserMetrics so lifetime
  // percentile ranks stay complete:
  //   1. Clean session end (activity.ts route handler)
  //   2. Orphan close (this sweep — for MCP crashes / hard Ctrl+C)
  //   3. Historical backfill (this sweep — self-heals pre-fix drift and any
  //      future rollup-path bug that leaves user_metrics holes)
  // Without these, getUserGlobalRank returns rank:null and every percentile
  // widget silently reads zeros.
  #maybeCleanup(): void {
    const now = Date.now();
    if (now - this.#lastCleanup < CLEANUP_INTERVAL_MS) return;
    this.#lastCleanup = now;
    const orphans = runCleanup(this.sql, this.#getAllConnectedMemberIds(), this.#transact);
    this.#flushUserMetricsBackfill(orphans);
  }

  async #flushUserMetricsBackfill(orphans: OrphanSummary[]): Promise<void> {
    const db = getDB(this.env);

    // Path 2: new orphans just closed by the sweep.
    for (const { handle, summary } of orphans) {
      db.updateUserMetrics(handle, summary).catch((err: unknown) => {
        log.warn('updateUserMetrics failed for orphaned session', {
          handle,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Path 3: self-healing backfill for handles that have closed sessions but
    // no user_metrics row. One RPC to check existence, then per-session emits
    // for the missing handles only. Idempotent — a handle that already has a
    // row is skipped, so re-running across sweeps converges at zero work.
    try {
      const candidates = this.sql
        .exec(`SELECT DISTINCT handle FROM sessions WHERE ended_at IS NOT NULL AND handle != ''`)
        .toArray() as Array<{ handle: string }>;
      if (candidates.length === 0) return;

      const existing = await db.existingMetricsHandles(candidates.map((r) => r.handle));
      const existingSet = new Set(existing);
      const backfills = collectHandleBackfills(this.sql, existingSet);
      for (const { handle, summary } of backfills) {
        db.updateUserMetrics(handle, summary).catch((err: unknown) => {
          log.warn('updateUserMetrics backfill failed', {
            handle,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      log.warn('user_metrics backfill sweep failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  #recordMetric(metric: string): void {
    recordMetricFn(this.sql, metric);
  }

  /**
   * Public surface for telemetry-only RPC calls. Route handlers that
   * decide to record a metric without invoking a write path (e.g. the
   * secret detector blocking a save) call this. Cheap; just bumps
   * daily_metrics. No member resolution needed — the route already
   * authenticated the caller.
   */
  async recordTelemetry(metric: string): Promise<{ ok: true }> {
    this.#ensureSchema();
    this.#recordMetric(metric);
    return { ok: true };
  }

  // -- Identity resolution (delegated to identity.ts) --

  #resolveOwnedAgentId(agentId: string, ownerId: string | null = null): string | null {
    return resolveOwnedAgentId(this.sql, agentId, ownerId);
  }

  // -- Membership --

  async join(
    agentId: string,
    ownerId: string,
    ownerHandle: string,
    runtimeOrTool: string | Record<string, unknown> | null = 'unknown',
  ): Promise<DOResult<{ ok: true }>> {
    return joinRpc(this.#rpcCtx(), agentId, ownerId, ownerHandle, runtimeOrTool);
  }

  async leave(agentId: string, ownerId: string | null = null): Promise<DOResult<{ ok: true }>> {
    return leaveRpc(this.#rpcCtx(), agentId, ownerId);
  }

  async heartbeat(
    agentId: string,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true }> | DOError> {
    return withMemberFn(this.#rpcCtx(), agentId, ownerId, (resolved) => {
      const result = heartbeatFn(this.sql, resolved);
      if (!isDOError(result)) {
        const now = Date.now();
        const last = this.#lastHeartbeatBroadcast.get(resolved) || 0;
        if (now - last >= HEARTBEAT_BROADCAST_DEBOUNCE_MS) {
          this.#lastHeartbeatBroadcast.set(resolved, now);
          this.#broadcastToWatchers(
            { type: 'heartbeat', agent_id: resolved, ts: now },
            { invalidateCache: false },
          );
        }
      }
      return result;
    });
  }

  // -- Activity --

  async updateActivity(
    agentId: string,
    files: string[],
    summary: string,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true }> | DOError> {
    return updateActivityRpc(this.#rpcCtx(), agentId, files, summary, ownerId);
  }

  async checkConflicts(
    agentId: string,
    files: string[],
    ownerId: string | null = null,
    source: 'hook' | 'advisory' = 'advisory',
  ): Promise<ReturnType<typeof checkConflictsRpc> | DOError> {
    return checkConflictsRpc(this.#rpcCtx(), agentId, files, ownerId, source);
  }

  async reportFile(
    agentId: string,
    filePath: string,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true }> | DOError> {
    return reportFileRpc(this.#rpcCtx(), agentId, filePath, ownerId);
  }

  // -- Context (composite queries -- logic in context.ts) --

  async getContext(
    agentId: string,
    ownerId: string | null = null,
  ): Promise<Record<string, unknown> | DOError> {
    return withMemberFn(this.#rpcCtx(), agentId, ownerId, (resolved) => {
      // Always bump calling agent's heartbeat
      this.sql.exec(
        "UPDATE members SET last_heartbeat = datetime('now') WHERE agent_id = ?",
        resolved,
      );

      // Per-agent messages (always fresh -- has target_agent filter, can't be cached team-wide)
      const messages = this.sql
        .exec(
          `SELECT handle AS from_handle, host_tool AS from_tool, host_tool AS from_host_tool, agent_surface AS from_agent_surface, text, created_at
         FROM messages
         WHERE created_at > datetime('now', '-1 hour')
           AND (target_agent IS NULL OR target_agent = ?)
         ORDER BY created_at DESC LIMIT 10`,
          resolved,
        )
        .toArray();

      // Daemon status — always fresh (computed from live WebSocket connections)
      const daemon = {
        connected: this.#hasExecutorConnected(),
        available_tools: this.#getAvailableSpawnTools(),
      };

      // Return cached team-wide context if fresh
      const cached = this.#contextCache.get();
      if (cached) {
        return { ...cached, messages, daemon };
      }

      this.#maybeCleanup();

      const connectedIds = this.#getConnectedAgentIds();
      const teamContext = queryTeamContext(this.sql, connectedIds);

      this.#contextCache.set(teamContext);

      return { ...teamContext, messages, daemon };
    });
  }

  // -- Sessions (observability) --

  async startSession(
    agentId: string,
    handle: string,
    framework: string,
    runtime: Record<string, unknown> | null = null,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true; session_id: string }> | DOError> {
    return startSessionRpc(this.#rpcCtx(), agentId, handle, framework, runtime, ownerId);
  }

  async endSession(
    agentId: string,
    sessionId: string,
    ownerId: string | null = null,
  ): Promise<
    | DOResult<{ ok: true; outcome?: string | null; summary?: Record<string, unknown> | null }>
    | DOError
  > {
    return endSessionRpc(this.#rpcCtx(), agentId, sessionId, ownerId);
  }

  async recordEdit(
    agentId: string,
    filePath: string,
    linesAdded = 0,
    linesRemoved = 0,
    ownerId: string | null = null,
  ): Promise<{ ok: true; skipped?: boolean } | DOError> {
    return recordEditRpc(this.#rpcCtx(), agentId, filePath, linesAdded, linesRemoved, ownerId);
  }

  async reportOutcome(
    agentId: string,
    outcome: string,
    summary: string | null = null,
    ownerId: string | null = null,
    outcomeTags?: string[] | null,
  ): Promise<DOResult<{ ok: true }> | DOError> {
    return reportOutcomeRpc(this.#rpcCtx(), agentId, outcome, summary, ownerId, outcomeTags);
  }

  async getHistory(
    agentId: string,
    days: number,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof getHistoryRpc> | DOError> {
    return getHistoryRpc(this.#rpcCtx(), agentId, days, ownerId);
  }

  async getEditHistory(
    agentId: string,
    days: number,
    filePath: string | null = null,
    handle: string | null = null,
    limit = 200,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof getEditHistoryRpc> | DOError> {
    return getEditHistoryRpc(this.#rpcCtx(), agentId, days, filePath, handle, limit, ownerId);
  }

  async getAnalytics(
    agentId: string,
    days: number,
    ownerId: string | null = null,
    extended = false,
    tzOffsetMinutes: number = 0,
  ): Promise<ReturnType<typeof getAnalyticsRpc>> {
    return getAnalyticsRpc(this.#rpcCtx(), agentId, days, ownerId, extended, tzOffsetMinutes);
  }

  async enrichModel(
    agentId: string,
    model: string,
    ownerId: string | null = null,
  ): Promise<{ ok: true } | DOError> {
    return enrichModelRpc(this.#rpcCtx(), agentId, model, ownerId);
  }

  async recordTokenUsage(
    agentId: string,
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    cacheCreationTokens: number,
    ownerId: string | null = null,
  ): Promise<{ ok: true } | DOError> {
    return recordTokenUsageRpc(
      this.#rpcCtx(),
      agentId,
      sessionId,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      ownerId,
    );
  }

  async recordToolCalls(
    agentId: string,
    sessionId: string,
    handle: string,
    hostTool: string,
    calls: ToolCallInput[],
    ownerId: string | null = null,
  ): Promise<{ ok: true; recorded: number } | DOError> {
    return recordToolCallsRpc(this.#rpcCtx(), agentId, sessionId, handle, hostTool, calls, ownerId);
  }

  async recordCommits(
    agentId: string,
    sessionId: string | null,
    handle: string,
    hostTool: string,
    commits: CommitInput[],
    ownerId: string | null = null,
  ): Promise<{ ok: true; recorded: number } | DOError> {
    return recordCommitsRpc(this.#rpcCtx(), agentId, sessionId, handle, hostTool, commits, ownerId);
  }

  // -- Conversation intelligence --

  async recordConversationEvents(
    agentId: string,
    sessionId: string,
    handle: string,
    hostTool: string,
    events: ConversationEventInput[],
    ownerId: string | null = null,
  ): Promise<{ ok: true; count: number } | DOError> {
    return recordConversationEventsRpc(
      this.#rpcCtx(),
      agentId,
      sessionId,
      handle,
      hostTool,
      events,
      ownerId,
    );
  }

  async getConversation(
    agentId: string,
    sessionId: string,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof getConversationRpc> | DOError> {
    return getConversationRpc(this.#rpcCtx(), agentId, sessionId, ownerId);
  }

  async getConversationAnalytics(
    agentId: string,
    days: number,
    ownerId: string | null = null,
  ): Promise<ConversationAnalytics | DOError> {
    return getConversationAnalyticsRpc(this.#rpcCtx(), agentId, days, ownerId);
  }

  async getSessionConversationStats(
    agentId: string,
    sessionIds: string[],
    ownerId: string | null = null,
  ): Promise<{ ok: true; stats: SessionConversationStats[] } | DOError> {
    return getSessionConversationStatsRpc(this.#rpcCtx(), agentId, sessionIds, ownerId);
  }

  // -- Memory --

  async saveMemory(
    agentId: string,
    text: string,
    tags: string[],
    categories: string[] | null = null,
    handle: string,
    runtime: Record<string, unknown> | null = null,
    ownerId: string | null = null,
    textHash: string | null = null,
    embedding: ArrayBuffer | null = null,
  ): Promise<ReturnType<typeof saveMemoryRpc> | DOError> {
    return saveMemoryRpc(
      this.#rpcCtx(),
      agentId,
      text,
      tags,
      categories,
      handle,
      runtime,
      ownerId,
      textHash,
      embedding,
    );
  }

  async searchMemories(
    agentId: string,
    query: string | null,
    tags: string[] | null,
    categories: string[] | null = null,
    limit = 20,
    ownerId: string | null = null,
    filters: Omit<SearchFilters, 'query' | 'tags' | 'categories' | 'limit'> = {},
  ): Promise<ReturnType<typeof searchMemoriesRpc> | DOError> {
    return searchMemoriesRpc(
      this.#rpcCtx(),
      agentId,
      query,
      tags,
      categories,
      limit,
      ownerId,
      filters,
    );
  }

  async updateMemory(
    agentId: string,
    memoryId: string,
    text: string | undefined,
    tags: string[] | undefined,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true }> | DOError> {
    return updateMemoryRpc(this.#rpcCtx(), agentId, memoryId, text, tags, ownerId);
  }

  async deleteMemory(
    agentId: string,
    memoryId: string,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true }> | DOError> {
    return deleteMemoryRpc(this.#rpcCtx(), agentId, memoryId, ownerId);
  }

  async deleteMemoriesBatch(
    agentId: string,
    filter: BatchDeleteFilter,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true; deleted: number }> | DOError> {
    return deleteMemoriesBatchRpc(this.#rpcCtx(), agentId, filter, ownerId);
  }

  // -- Memory Consolidation (review queue, propose-only, reversible) --

  async runConsolidation(): Promise<ReturnType<typeof runConsolidationRpc>> {
    return runConsolidationRpc(this.#rpcCtx());
  }

  async listConsolidationProposals(
    agentId: string,
    limit: number = 50,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof listConsolidationProposalsRpc> | DOError> {
    return listConsolidationProposalsRpc(this.#rpcCtx(), agentId, limit, ownerId);
  }

  async applyConsolidationProposal(
    agentId: string,
    proposalId: string,
    reviewerHandle: string,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof applyConsolidationProposalRpc> | DOError> {
    return applyConsolidationProposalRpc(
      this.#rpcCtx(),
      agentId,
      proposalId,
      reviewerHandle,
      ownerId,
    );
  }

  async rejectConsolidationProposal(
    agentId: string,
    proposalId: string,
    reviewerHandle: string,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof rejectConsolidationProposalRpc> | DOError> {
    return rejectConsolidationProposalRpc(
      this.#rpcCtx(),
      agentId,
      proposalId,
      reviewerHandle,
      ownerId,
    );
  }

  async unmergeMemory(
    agentId: string,
    memoryId: string,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof unmergeMemoryRpc> | DOError> {
    return unmergeMemoryRpc(this.#rpcCtx(), agentId, memoryId, ownerId);
  }

  // -- Formation (shadow-mode auditor: classifies but never applies) --

  async runFormationOnRecent(
    limit: number = 20,
  ): Promise<{ ok: true; processed: number; skipped: number }> {
    return runFormationOnRecentRpc(this.#rpcCtx(), limit);
  }

  async runFormationOnMemory(memoryId: string): Promise<{ ok: true }> {
    return runFormationOnMemoryRpc(this.#rpcCtx(), memoryId);
  }

  async listFormationObservations(
    agentId: string,
    filter: { recommendation?: FormationRecommendation; limit?: number } = {},
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof listFormationObservationsRpc> | DOError> {
    return listFormationObservationsRpc(this.#rpcCtx(), agentId, filter, ownerId);
  }

  // -- Memory Categories --

  async createCategory(
    agentId: string,
    name: string,
    description: string,
    color: string | null = null,
    embedding: ArrayBuffer | null = null,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true; id: string }> | DOError> {
    return createCategoryRpc(this.#rpcCtx(), agentId, name, description, color, embedding, ownerId);
  }

  async listCategories(
    agentId: string,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof listCategoriesRpc> | DOError> {
    return listCategoriesRpc(this.#rpcCtx(), agentId, ownerId);
  }

  async getCategoryNames(
    agentId: string,
    ownerId: string | null = null,
  ): Promise<{ ok: true; names: string[] } | DOError> {
    return getCategoryNamesRpc(this.#rpcCtx(), agentId, ownerId);
  }

  async updateCategory(
    agentId: string,
    categoryId: string,
    name: string | undefined,
    description: string | undefined,
    color: string | undefined,
    embedding: ArrayBuffer | null | undefined,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true }> | DOError> {
    return updateCategoryRpc(
      this.#rpcCtx(),
      agentId,
      categoryId,
      name,
      description,
      color,
      embedding,
      ownerId,
    );
  }

  async deleteCategory(
    agentId: string,
    categoryId: string,
    ownerId: string | null = null,
  ): Promise<DOResult<{ ok: true }> | DOError> {
    return deleteCategoryRpc(this.#rpcCtx(), agentId, categoryId, ownerId);
  }

  async getPromotableTags(
    agentId: string,
    threshold: number,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof getPromotableTagsRpc> | DOError> {
    return getPromotableTagsRpc(this.#rpcCtx(), agentId, threshold, ownerId);
  }

  // -- File Locks --

  async claimFiles(
    agentId: string,
    files: string[],
    handle: string,
    runtimeOrTool: string | Record<string, unknown> | null | undefined,
    ownerId: string | null = null,
    options: { ttlSeconds?: number } = {},
  ): Promise<ReturnType<typeof claimFilesRpc> | DOError> {
    return claimFilesRpc(this.#rpcCtx(), agentId, files, handle, runtimeOrTool, ownerId, options);
  }

  async checkFileConflicts(
    agentId: string,
    files: string[],
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof checkFileConflictsRpc> | DOError> {
    return checkFileConflictsRpc(this.#rpcCtx(), agentId, files, ownerId);
  }

  async releaseFiles(
    agentId: string,
    files: string[] | null | undefined,
    ownerId: string | null = null,
  ): Promise<{ ok: true } | DOError> {
    return releaseFilesRpc(this.#rpcCtx(), agentId, files, ownerId);
  }

  async getLockedFiles(
    agentId: string,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof getLockedFilesRpc> | DOError> {
    return getLockedFilesRpc(this.#rpcCtx(), agentId, ownerId);
  }

  // -- Messages --

  async sendMessage(
    agentId: string,
    handle: string,
    runtimeOrTool: string | Record<string, unknown> | null | undefined,
    text: string,
    targetAgent: string | null | undefined,
    ownerId: string | null = null,
  ): Promise<{ ok: true; id: string } | DOError> {
    return sendMessageRpc(
      this.#rpcCtx(),
      agentId,
      handle,
      runtimeOrTool,
      text,
      targetAgent,
      ownerId,
    );
  }

  async getMessages(
    agentId: string,
    since: string | null | undefined,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof getMessagesRpc> | DOError> {
    return getMessagesRpc(this.#rpcCtx(), agentId, since, ownerId);
  }

  // -- Commands (daemon relay) --

  async submitCommand(
    agentId: string,
    ownerId: string,
    senderHandle: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: true; id: string; warning?: string } | DOError> {
    return submitCommandRpc(this.#rpcCtx(), agentId, ownerId, senderHandle, type, payload);
  }

  async getCommands(
    agentId: string,
    ownerId: string | null = null,
  ): Promise<ReturnType<typeof getCommandsRpc> | DOError> {
    return getCommandsRpc(this.#rpcCtx(), agentId, ownerId);
  }

  // -- Session timeline (individual session records for swimlane visualization) --

  async getSessionsInRange(
    ownerId: string,
    fromDate: string,
    toDate: string,
    filters?: { hostTool?: string; handle?: string },
  ): Promise<ReturnType<typeof getSessionsInRangeRpc>> {
    return getSessionsInRangeRpc(this.#rpcCtx(), ownerId, fromDate, toDate, filters);
  }

  // -- Extended analytics (cross-project dashboard) --

  async getAnalyticsForOwner(
    ownerId: string,
    days: number,
    tzOffsetMinutes: number = 0,
  ): Promise<ReturnType<typeof getAnalyticsForOwnerRpc>> {
    return getAnalyticsForOwnerRpc(this.#rpcCtx(), ownerId, days, tzOffsetMinutes);
  }

  // -- Summary (lightweight, for cross-project dashboard) --

  async getSummary(ownerId: string): Promise<ReturnType<typeof getSummaryRpc>> {
    return getSummaryRpc(this.#rpcCtx(), ownerId);
  }

  // -- Billing blocks (5h Anthropic rate-limit windows) --

  async getBillingBlocks(ownerId: string): Promise<ReturnType<typeof getBillingBlocksRpc>> {
    return getBillingBlocksRpc(this.#rpcCtx(), ownerId);
  }
}

// Re-export path utility for consumers
export { normalizePath } from '../../lib/text-utils.js';
