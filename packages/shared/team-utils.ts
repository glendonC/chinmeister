import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export interface TeamFileInfo {
  filePath: string;
  root: string;
  teamId: string;
  teamName: string;
}

export const TEAM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidTeamId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 30 && TEAM_ID_PATTERN.test(id);
}

export function findTeamFile(startDir = process.cwd()): TeamFileInfo | null {
  let dir = startDir;
  while (true) {
    const filePath = join(dir, '.chinwag');
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw) as { team?: string | null; name?: string | null };
        const teamId = data.team ?? null;
        if (!teamId || !isValidTeamId(teamId)) return null;
        return {
          filePath,
          root: dir,
          teamId,
          teamName: data.name || basename(dir),
        };
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
