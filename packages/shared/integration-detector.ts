import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HOST_INTEGRATIONS, type HostIntegration } from './integration-model.js';

const EXEC_TIMEOUT_MS = 5000;

export function commandExists(cmd: string): boolean {
  try {
    const bin = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(bin, [cmd], { stdio: 'ignore', timeout: EXEC_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

export function detectHost(cwd: string, host: HostIntegration): boolean {
  const dirs = host.detect?.dirs || [];
  const cmds = host.detect?.cmds || [];
  return dirs.some((dir) => existsSync(join(cwd, dir))) || cmds.some((cmd) => commandExists(cmd));
}

export function detectHostIntegrations(cwd: string): HostIntegration[] {
  return HOST_INTEGRATIONS.filter((host) => detectHost(cwd, host));
}
