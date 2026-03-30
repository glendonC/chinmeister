import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { CONFIG_DIR, CONFIG_FILE } from '../../shared/config.js';

export { CONFIG_DIR, CONFIG_FILE, configExists, loadConfig } from '../../shared/config.js';

export function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function deleteConfig() {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
  }
}
