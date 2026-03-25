import { createStore, useStore } from 'zustand';
import { api } from '../api.js';
import { authActions } from './auth.js';

/** Set of team IDs we've joined this session (for the /join call) */
const joinedTeams = new Set();

const teamStore = createStore((set, get) => ({
  teams: [],
  activeTeamId: null,

  /**
   * Load all teams for the current user.
   * Auto-selects overview if 2+ teams, or the single team if only 1.
   */
  async loadTeams() {
    const { token } = authActions.getState();
    try {
      const result = await api('GET', '/me/teams', null, token);
      const teamList = result.teams || [];
      set({ teams: teamList });

      if (teamList.length > 1) {
        set({ activeTeamId: null }); // overview mode
      } else if (teamList.length === 1) {
        set({ activeTeamId: teamList[0].team_id });
      } else {
        set({ activeTeamId: null });
      }
    } catch {
      set({ teams: [], activeTeamId: null });
    }
  },

  /** Select a specific team (or null for overview). */
  selectTeam(teamId) {
    set({ activeTeamId: teamId });
  },

  /**
   * Ensure we've joined a team (POST /teams/{id}/join).
   * Only calls once per session per team.
   */
  async ensureJoined(teamId) {
    if (joinedTeams.has(teamId)) return;
    const { token } = authActions.getState();
    try {
      await api('POST', `/teams/${teamId}/join`, {}, token);
      joinedTeams.add(teamId);
    } catch {
      // non-critical — continue even if join fails
    }
  },
}));

/** React hook — use inside components */
export function useTeamStore(selector) {
  return useStore(teamStore, selector);
}

/** Direct access — use outside components */
export const teamActions = {
  getState: () => teamStore.getState(),
  loadTeams: () => teamStore.getState().loadTeams(),
  selectTeam: (id) => teamStore.getState().selectTeam(id),
  ensureJoined: (id) => teamStore.getState().ensureJoined(id),
  subscribe: teamStore.subscribe,
};
