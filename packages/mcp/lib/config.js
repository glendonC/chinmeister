import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.chinwag');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function configExists() {
  return existsSync(CONFIG_FILE);
}

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    console.error('[chinwag] Warning: config file corrupted, ignoring');
    return null;
  }
}
