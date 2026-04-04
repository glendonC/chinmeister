// Team lock routes — claim, release, get locks.

import { json } from '../../lib/http.js';
import { teamJsonRoute, teamRoute, doResult } from '../../lib/middleware.js';
import { validateFileArray, withTeamRateLimit } from '../../lib/validation.js';
import { LOCK_CLAIM_MAX_FILES, RATE_LIMIT_LOCKS } from '../../lib/constants.js';

export const handleTeamClaimFiles = teamJsonRoute(async ({ body, user, env, teamId, request }) => {
  const { files } = body;
  const fileErr = validateFileArray(files, LOCK_CLAIM_MAX_FILES);
  if (fileErr) return json({ error: fileErr }, 400);

  return withTeamRateLimit({
    request,
    user,
    env,
    teamId,
    rateLimitKey: 'locks',
    rateLimitMax: RATE_LIMIT_LOCKS,
    rateLimitMsg: 'Lock claim limit reached (100/day). Try again tomorrow.',
    action: (team, agentId, runtime) =>
      team.claimFiles(agentId, files as string[], user.handle, runtime, user.id),
  });
});

export const handleTeamReleaseFiles = teamJsonRoute(async ({ body, agentId, team, user }) => {
  const files = (body.files || null) as string[] | null;
  const fileErr = validateFileArray(files, LOCK_CLAIM_MAX_FILES, { nullable: true });
  if (fileErr) return json({ error: fileErr }, 400);

  return doResult(team.releaseFiles(agentId, files, user.id), 'releaseFiles');
});

export const handleTeamGetLocks = teamRoute(async ({ agentId, team, user }) => {
  return doResult(team.getLockedFiles(agentId, user.id), 'getLockedFiles');
});
