/**
 * Get the singleton DatabaseDO stub.
 * @param {import('../types.js').Env} env
 * @returns {any} DatabaseDO stub (RPC)
 */
export function getDB(env) {
  return env.DATABASE.get(env.DATABASE.idFromName('main'));
}

/**
 * Get the singleton LobbyDO stub.
 * @param {import('../types.js').Env} env
 * @returns {any} LobbyDO stub (RPC)
 */
export function getLobby(env) {
  return env.LOBBY.get(env.LOBBY.idFromName('main'));
}

/**
 * Get a TeamDO stub by team ID.
 * @param {import('../types.js').Env} env
 * @param {string} teamId
 * @returns {any} TeamDO stub (RPC)
 */
export function getTeam(env, teamId) {
  return env.TEAM.get(env.TEAM.idFromName(teamId));
}
