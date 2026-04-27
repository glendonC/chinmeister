// Auth profile + team list demo data. The auth store and the team store
// short-circuit their /me and /me/teams fetches when demo is active and
// pull from these factories instead, so the sidebar, profile pill, and
// settings view stay coherent with the rest of the demo overlay.

import type { UserProfile, UserTeams } from '../apiSchemas.js';
import { DEMO_TEAMS } from './baseline.js';

export function createBaselineMe(): UserProfile {
  return {
    handle: 'glendon',
    color: 'cyan',
    created_at: '2026-01-15T10:00:00Z',
    budgets: null,
    github_id: 'demo-gh-1',
    github_login: 'glendon-demo',
    avatar_url: null,
  };
}

export function createBaselineTeams(): UserTeams {
  return {
    teams: DEMO_TEAMS.map((t) => ({
      team_id: t.team_id,
      team_name: t.team_name,
      joined_at: '2026-01-15T10:00:00Z',
    })),
  };
}

export function createEmptyTeams(): UserTeams {
  return { teams: [] };
}
