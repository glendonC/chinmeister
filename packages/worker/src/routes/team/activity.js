// Team activity routes — activity reporting, conflicts, file reporting, sessions, history.

import { isBlocked } from '../../moderation.js';
import { getDB, getTeam } from '../../lib/env.js';
import { json, parseBody } from '../../lib/http.js';
import { getAgentRuntime, teamErrorStatus } from '../../lib/request-utils.js';
import {
  requireJson,
  requireString,
  sanitizeString,
  validateFileArray,
  withRateLimit,
} from '../../lib/validation.js';
import {
  ACTIVITY_MAX_FILES,
  MAX_SUMMARY_LENGTH,
  MAX_FILE_PATH_LENGTH,
  MAX_FRAMEWORK_LENGTH,
  MAX_MODEL_LENGTH,
  RATE_LIMIT_FILE_REPORTS,
  RATE_LIMIT_SESSIONS,
  RATE_LIMIT_EDITS,
  HISTORY_DEFAULT_DAYS,
  HISTORY_MAX_DAYS,
} from '../../lib/constants.js';

export async function handleTeamActivity(request, user, env, teamId) {
  const body = await parseBody(request);
  const parseErr = requireJson(body);
  if (parseErr) return parseErr;

  const { files, summary } = body;
  const fileErr = validateFileArray(files, ACTIVITY_MAX_FILES);
  if (fileErr) return json({ error: fileErr }, 400);

  if (typeof summary !== 'string') return json({ error: 'summary must be a string' }, 400);
  if (summary.length > MAX_SUMMARY_LENGTH)
    return json({ error: `summary must be ${MAX_SUMMARY_LENGTH} characters or less` }, 400);
  // Moderation: sync blocklist on activity summary.
  // isBlocked('') returns false, so no need to guard against empty strings.
  if (isBlocked(summary)) return json({ error: 'Content blocked' }, 400);

  const { agentId } = getAgentRuntime(request, user);
  const team = getTeam(env, teamId);
  const result = await team.updateActivity(agentId, files, summary, user.id);
  if (result.error) return json({ error: result.error }, teamErrorStatus(result));
  return json(result);
}

export async function handleTeamConflicts(request, user, env, teamId) {
  const body = await parseBody(request);
  const parseErr = requireJson(body);
  if (parseErr) return parseErr;

  const { files } = body;
  const fileErr = validateFileArray(files, ACTIVITY_MAX_FILES);
  if (fileErr) return json({ error: fileErr }, 400);

  const { agentId } = getAgentRuntime(request, user);
  const team = getTeam(env, teamId);
  const result = await team.checkConflicts(agentId, files, user.id);
  if (result.error) return json({ error: result.error }, teamErrorStatus(result));
  return json(result);
}

export async function handleTeamFile(request, user, env, teamId) {
  const body = await parseBody(request);
  const parseErr = requireJson(body);
  if (parseErr) return parseErr;

  const file = requireString(body, 'file', MAX_FILE_PATH_LENGTH);
  if (!file) return json({ error: 'file must be a non-empty string' }, 400);

  const db = getDB(env);
  const { agentId } = getAgentRuntime(request, user);
  const team = getTeam(env, teamId);

  return withRateLimit(
    db,
    `file:${user.id}`,
    RATE_LIMIT_FILE_REPORTS,
    'File report limit reached (500/day). Try again tomorrow.',
    async () => {
      const result = await team.reportFile(agentId, file, user.id);
      if (result.error) return json({ error: result.error }, teamErrorStatus(result));
      return json(result);
    },
  );
}

export async function handleTeamStartSession(request, user, env, teamId) {
  const body = await parseBody(request);
  const parseErr = requireJson(body);
  if (parseErr) return parseErr;

  const framework = sanitizeString(body.framework, MAX_FRAMEWORK_LENGTH) || 'unknown';

  const db = getDB(env);
  const runtime = getAgentRuntime(request, user);
  const agentId = runtime.agentId;
  const team = getTeam(env, teamId);

  return withRateLimit(
    db,
    `session:${user.id}`,
    RATE_LIMIT_SESSIONS,
    'Session limit reached. Try again tomorrow.',
    async () => {
      const result = await team.startSession(agentId, user.handle, framework, runtime, user.id);
      if (result.error) return json({ error: result.error }, teamErrorStatus(result));
      return json(result, 201);
    },
  );
}

export async function handleTeamEndSession(request, user, env, teamId) {
  const body = await parseBody(request);
  const parseErr = requireJson(body);
  if (parseErr) return parseErr;

  const session_id = requireString(body, 'session_id');
  if (!session_id) return json({ error: 'session_id is required' }, 400);

  const { agentId } = getAgentRuntime(request, user);
  const team = getTeam(env, teamId);
  const result = await team.endSession(agentId, session_id, user.id);
  if (result.error) return json({ error: result.error }, teamErrorStatus(result));
  return json(result);
}

export async function handleTeamSessionEdit(request, user, env, teamId) {
  const body = await parseBody(request);
  const parseErr = requireJson(body);
  if (parseErr) return parseErr;

  const file = requireString(body, 'file', MAX_FILE_PATH_LENGTH);
  if (!file) return json({ error: 'file is required' }, 400);

  const db = getDB(env);
  const { agentId } = getAgentRuntime(request, user);
  const team = getTeam(env, teamId);

  return withRateLimit(
    db,
    `edit:${user.id}`,
    RATE_LIMIT_EDITS,
    'Edit recording limit reached. Try again tomorrow.',
    async () => {
      const result = await team.recordEdit(agentId, file, user.id);
      if (result.error) return json({ error: result.error }, teamErrorStatus(result));
      return json(result);
    },
  );
}

export async function handleTeamHistory(request, user, env, teamId) {
  const url = new URL(request.url);
  const parsed = parseInt(url.searchParams.get('days') || String(HISTORY_DEFAULT_DAYS), 10);
  const days = Math.max(
    1,
    Math.min(isNaN(parsed) ? HISTORY_DEFAULT_DAYS : parsed, HISTORY_MAX_DAYS),
  );

  const { agentId } = getAgentRuntime(request, user);
  const team = getTeam(env, teamId);
  const result = await team.getHistory(agentId, days, user.id);
  if (result.error) return json({ error: result.error }, teamErrorStatus(result));
  return json(result);
}

export async function handleTeamEnrichModel(request, user, env, teamId) {
  const body = await parseBody(request);
  const parseErr = requireJson(body);
  if (parseErr) return parseErr;

  const model = requireString(body, 'model', MAX_MODEL_LENGTH);
  if (!model) return json({ error: 'model is required' }, 400);

  const { agentId } = getAgentRuntime(request, user);
  const team = getTeam(env, teamId);
  const result = await team.enrichModel(agentId, model, user.id);
  if (result.error) return json({ error: result.error }, teamErrorStatus(result));
  return json(result);
}
