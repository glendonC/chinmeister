import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

const TEAM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidTeamId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 30 && TEAM_ID_PATTERN.test(id);
}

export function findTeamFile(cwd = process.cwd()) {
  let dir = cwd;
  while (true) {
    const filePath = join(dir, '.chinwag');
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        const teamId = data.team || null;
        if (teamId && !isValidTeamId(teamId)) return null;
        return teamId;
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function teamHandlers(client) {
  function validateTeam(teamId) {
    if (!teamId || !isValidTeamId(teamId)) throw new Error('Invalid or missing team ID');
  }

  return {
    async joinTeam(teamId, name = null) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/join`, name ? { name } : {});
    },

    async leaveTeam(teamId) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/leave`, {});
    },

    async updateActivity(teamId, files, summary) {
      validateTeam(teamId);
      return client.put(`/teams/${teamId}/activity`, { files, summary });
    },

    async checkConflicts(teamId, files) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/conflicts`, { files });
    },

    async getTeamContext(teamId) {
      validateTeam(teamId);
      return client.get(`/teams/${teamId}/context`);
    },

    async heartbeat(teamId) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/heartbeat`, {});
    },

    async reportFile(teamId, file) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/file`, { file });
    },

    async saveMemory(teamId, text, category) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/memory`, { text, category });
    },

    async startSession(teamId, framework) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/sessions`, { framework });
    },

    async endSession(teamId, sessionId) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/sessionend`, { session_id: sessionId });
    },

    async recordEdit(teamId, file) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/sessionedit`, { file });
    },

    async getHistory(teamId, days = 7) {
      validateTeam(teamId);
      return client.get(`/teams/${teamId}/history?days=${days}`);
    },
  };
}
