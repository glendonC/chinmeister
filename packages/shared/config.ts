import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ChinwagConfig {
  token?: string;
  handle?: string;
  userId?: string;
  color?: string;
}

export const CONFIG_DIR = join(homedir(), '.chinwag');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): ChinwagConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as ChinwagConfig;
  } catch {
    console.error('[chinwag] Warning: config file corrupted, ignoring');
    return null;
  }
}
