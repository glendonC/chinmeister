import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';

export const TEAM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidTeamId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 30 && TEAM_ID_PATTERN.test(id);
}

/**
 * Walk up from startDir to find .chinwag file.
 * Returns { filePath, root, teamId, teamName } or null if not found.
 * Returns null if the file is unparseable or the team ID is invalid.
 */
export function findTeamFile(startDir = process.cwd()) {
  let dir = startDir;
  while (true) {
    const filePath = join(dir, '.chinwag');
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        const teamId = data.team || null;
        if (!teamId || !isValidTeamId(teamId)) return null;
        return {
          filePath,
          root: dir,
          teamId,
          teamName: data.name || basename(dir),
        };
      } catch (err) {
        console.error(`[chinwag] Failed to parse team file at ${filePath}: ${err.message}`);
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
