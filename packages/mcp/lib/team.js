import {
  TEAM_ID_PATTERN,
  isValidTeamId,
  findTeamFile as findTeamFileShared,
} from '../../shared/team-utils.js';

export { TEAM_ID_PATTERN, isValidTeamId };

/**
 * Find .chinwag file and return the team ID, or null.
 * Wraps the shared findTeamFile to preserve the MCP-expected return type (string | null).
 */
export function findTeamFile(cwd = process.cwd()) {
  const result = findTeamFileShared(cwd);
  return result ? result.teamId : null;
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

    async saveMemory(teamId, text, tags) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/memory`, { text, tags: tags || [] });
    },

    async searchMemories(teamId, query, tags, limit) {
      validateTeam(teamId);
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (tags?.length) params.set('tags', tags.join(','));
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return client.get(`/teams/${teamId}/memory${qs ? '?' + qs : ''}`);
    },

    async updateMemory(teamId, id, text, tags) {
      validateTeam(teamId);
      const body = { id };
      if (text !== undefined) body.text = text;
      if (tags !== undefined) body.tags = tags;
      return client.put(`/teams/${teamId}/memory`, body);
    },

    async deleteMemory(teamId, id) {
      validateTeam(teamId);
      return client.del(`/teams/${teamId}/memory`, { id });
    },

    async claimFiles(teamId, files) {
      validateTeam(teamId);
      return client.post(`/teams/${teamId}/locks`, { files });
    },

    async releaseFiles(teamId, files) {
      validateTeam(teamId);
      return client.del(`/teams/${teamId}/locks`, files ? { files } : {});
    },

    async sendMessage(teamId, text, target) {
      validateTeam(teamId);
      const body = { text };
      if (target) body.target = target;
      return client.post(`/teams/${teamId}/messages`, body);
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
  };
}
