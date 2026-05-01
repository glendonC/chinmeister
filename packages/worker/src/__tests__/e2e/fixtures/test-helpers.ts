// Shared helpers for end-to-end tests that exercise the full
// HTTP -> middleware -> route -> DO RPC stack as well as direct DO RPC paths.
//
// The @cloudflare/vitest-pool-workers pool isolates Durable Object state per
// test file, so each helper invocation gets a fresh world. We still keep
// distinct names per test (and a best-effort cleanup) so a future change to
// pool-level isolation does not silently cause cross-test contamination.

import type { env } from 'cloudflare:test';

type WorkerEnv = typeof env;

export interface CreatedUser {
  userId: string;
  handle: string;
  token: string;
  authHeaders: Record<string, string>;
}

export interface CreatedTeam extends CreatedUser {
  teamId: string;
}

interface CreateUserAndTeamOptions {
  /** Optional team display name. Skipped if omitted to avoid AI moderation. */
  name?: string | null;
}

function getDB(workerEnv: WorkerEnv) {
  return workerEnv.DATABASE.get(workerEnv.DATABASE.idFromName('main'));
}

function getTeam(workerEnv: WorkerEnv, teamId: string) {
  return workerEnv.TEAM.get(workerEnv.TEAM.idFromName(teamId));
}

/**
 * Create a fresh user via DatabaseDO RPC, mint an auth token in KV, and
 * provision a TeamDO via the same RPC the HTTP route uses. Returns the bag
 * of identifiers and ready-to-use `Authorization` + `Content-Type` headers.
 */
export async function createUserAndTeam(
  workerEnv: WorkerEnv,
  options: CreateUserAndTeamOptions = {},
): Promise<CreatedTeam> {
  const db = getDB(workerEnv);
  const userResult = await db.createUser();
  if ('error' in userResult) throw new Error(`createUser failed: ${userResult.error}`);
  const { id: userId, handle, token } = userResult;

  await workerEnv.AUTH_KV.put(`token:${token}`, userId);

  const teamId = 't_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const team = getTeam(workerEnv, teamId);
  const ownerAgentId = userId;
  const joinResult = await team.join(ownerAgentId, userId, handle, 'cursor');
  if ('error' in joinResult) throw new Error(`team.join failed: ${joinResult.error}`);

  const linkResult = await db.addUserTeam(userId, teamId, options.name ?? null);
  if ('error' in linkResult) throw new Error(`addUserTeam failed: ${linkResult.error}`);

  return {
    userId,
    handle,
    token,
    teamId,
    authHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

export interface JoinAgentOptions {
  agentId: string;
  handle: string;
  hostTool: string;
  userId: string;
}

/**
 * Add an additional agent to an existing team via TeamDO RPC. Used by tests
 * that need a second active agent (conflict, activity reflection) without
 * spinning up another HTTP join cycle.
 */
export async function joinAgent(
  workerEnv: WorkerEnv,
  teamId: string,
  options: JoinAgentOptions,
): Promise<void> {
  const team = getTeam(workerEnv, teamId);
  const result = await team.join(options.agentId, options.userId, options.handle, options.hostTool);
  if ('error' in result) throw new Error(`joinAgent failed: ${result.error}`);
}

/**
 * Best-effort cleanup so tests stay independent even if pool-level isolation
 * weakens. Errors are swallowed: the next test creates its own team anyway.
 */
export async function cleanupTeam(workerEnv: WorkerEnv, teamId: string): Promise<void> {
  try {
    const team = getTeam(workerEnv, teamId);
    await team.recordTelemetry('e2e_cleanup');
  } catch {
    /* non-critical */
  }
}
