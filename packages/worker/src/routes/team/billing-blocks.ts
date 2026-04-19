// Team billing-blocks route — 5-hour Anthropic rate-limit window state.
//
// Scoped to the caller's owner_id: the response covers every session
// the caller ran inside this team, regardless of which agent was used.
// That mirrors Anthropic's billing, which is per-account. Multi-team
// users still see per-team views here; cross-team aggregation would
// live at the route level and fan out to each TeamDO's getBillingBlocks.

import { teamRoute, doResult } from '../../lib/middleware.js';

export const handleTeamBillingBlocks = teamRoute(async ({ team, user }) => {
  return doResult(team.getBillingBlocks(user.id), 'getBillingBlocks');
});
