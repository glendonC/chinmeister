import { findTeamFile } from '../../shared/team-utils.js';

export function getProjectContext(cwd = process.cwd()) {
  const result = findTeamFile(cwd);
  if (!result) return null;
  return {
    filePath: result.filePath,
    root: result.root,
    teamId: result.teamId,
    teamName: result.teamName,
  };
}
