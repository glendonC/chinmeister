import { execFileSync } from 'child_process';
import { homedir } from 'os';

export const DASHBOARD_URL = process.env.CHINWAG_DASHBOARD_URL || 'https://chinwag.dev/dashboard';
export const MIN_WIDTH = 50;
export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function openWebDashboard(token) {
  const url = token ? `${DASHBOARD_URL}#token=${token}` : DASHBOARD_URL;
  try {
    if (process.platform === 'darwin') {
      execFileSync('open', [url], { stdio: 'ignore' });
      return { ok: true };
    }
    if (process.platform === 'linux') {
      execFileSync('xdg-open', [url], { stdio: 'ignore' });
      return { ok: true };
    }
    if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
      return { ok: true };
    }
    return { ok: false, error: 'Unsupported platform' };
  } catch {
    return { ok: false, error: 'Could not open browser' };
  }
}

// Strip ANSI escape codes, OSC sequences, cursor controls, and carriage returns
export function stripAnsi(str) {
  return str
    .replace(/\x1b\][^\x07]*\x07/g, '')          // OSC sequences (title, etc.)
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')       // CSI sequences (colors, cursor)
    .replace(/\x1b\([A-Z]/g, '')                    // Character set selection
    .replace(/\x1b[=>MNOP78]/g, '')                 // Other escape sequences
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // Control characters (keep \n \r \t)
    .replace(/\r/g, '');
}

export function getVisibleWindow(items, selectedIdx, maxItems) {
  if (!items?.length || items.length <= maxItems) {
    return { items: items || [], start: 0 };
  }

  if (selectedIdx == null || selectedIdx < 0) {
    return { items: items.slice(0, maxItems), start: 0 };
  }

  const half = Math.floor(maxItems / 2);
  let start = Math.max(0, selectedIdx - half);
  if (start + maxItems > items.length) {
    start = Math.max(0, items.length - maxItems);
  }

  return {
    items: items.slice(start, start + maxItems),
    start,
  };
}

export function formatProjectPath(projectRoot) {
  const home = homedir();
  if (projectRoot?.startsWith(home)) {
    return `~${projectRoot.slice(home.length)}`;
  }
  return projectRoot;
}
