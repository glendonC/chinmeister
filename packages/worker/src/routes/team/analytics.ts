// Team analytics route — aggregated workflow intelligence data.

import { teamRoute, doResult } from '../../lib/middleware.js';

const ANALYTICS_DEFAULT_DAYS = 7;
const ANALYTICS_MAX_DAYS = 90;

export const handleTeamAnalytics = teamRoute(async ({ request, agentId, team, user }) => {
  const url = new URL(request.url);
  const parsed = parseInt(url.searchParams.get('days') || String(ANALYTICS_DEFAULT_DAYS), 10);
  const days = Math.max(
    1,
    Math.min(isNaN(parsed) ? ANALYTICS_DEFAULT_DAYS : parsed, ANALYTICS_MAX_DAYS),
  );
  const extended = url.searchParams.get('extended') === '1';

  return doResult(team.getAnalytics(agentId, days, user.id, extended), 'getAnalytics');
});
