import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { CONFIG_DIR, CONFIG_FILE } from '@chinwag/shared/config.js';
import type { ChinwagConfig } from '@chinwag/shared/config.js';

export { CONFIG_DIR, CONFIG_FILE, configExists, loadConfig } from '@chinwag/shared/config.js';
export type { ChinwagConfig } from '@chinwag/shared/config.js';

export function saveConfig(config: ChinwagConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
  }
}
