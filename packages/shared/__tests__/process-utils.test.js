import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { readProcessInfo, getProcessTtyPath, getProcessCommandString } from '../process-utils.js';
import { execFileSync } from 'node:child_process';

describe('process-utils', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
    // Restore platform after any test that overrides it
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    delete process.env.CHINWAG_DEBUG;
  });

  describe('readProcessInfo', () => {
    it('returns {ppid, command} on valid ps output', () => {
      execFileSync.mockReturnValue('  1234 /usr/bin/node index.js\n');

      const result = readProcessInfo(42);
      expect(result).toEqual({ ppid: 1234, command: '/usr/bin/node index.js' });
      expect(execFileSync).toHaveBeenCalledWith('ps', ['-o', 'ppid=,command=', '-p', '42'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
    });

    it('parses ppid with no leading whitespace', () => {
      execFileSync.mockReturnValue('1 /sbin/launchd');

      const result = readProcessInfo(1);
      expect(result).toEqual({ ppid: 1, command: '/sbin/launchd' });
    });

    it('handles command strings containing spaces and special characters', () => {
      execFileSync.mockReturnValue('  500 /usr/bin/node --flag=true /path/to my app/index.js');

      const result = readProcessInfo(99);
      expect(result).toEqual({
        ppid: 500,
        command: '/usr/bin/node --flag=true /path/to my app/index.js',
      });
    });

    it('handles multiline command output (command with newlines)', () => {
      execFileSync.mockReturnValue('  100 some-command\nwith extra lines');

      const result = readProcessInfo(10);
      // The regex uses /s flag so . matches newlines
      expect(result).toEqual({
        ppid: 100,
        command: 'some-command\nwith extra lines',
      });
    });

    it('returns null when pid is 0', () => {
      const result = readProcessInfo(0);
      expect(result).toBeNull();
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('returns null when pid is negative', () => {
      const result = readProcessInfo(-1);
      expect(result).toBeNull();
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('returns null when pid is NaN', () => {
      const result = readProcessInfo(NaN);
      expect(result).toBeNull();
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('returns null when pid is undefined (falsy)', () => {
      const result = readProcessInfo(undefined);
      expect(result).toBeNull();
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('returns null on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = readProcessInfo(42);
      expect(result).toBeNull();
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('returns null when ps returns empty output', () => {
      execFileSync.mockReturnValue('   \n');

      const result = readProcessInfo(42);
      expect(result).toBeNull();
    });

    it('returns null when ps output does not match expected format', () => {
      execFileSync.mockReturnValue('garbage output no numbers');

      const result = readProcessInfo(42);
      expect(result).toBeNull();
    });

    it('returns null when execFileSync throws (process not found)', () => {
      execFileSync.mockImplementation(() => {
        throw new Error('Command failed: ps');
      });

      const result = readProcessInfo(42);
      expect(result).toBeNull();
    });

    it('logs debug info when CHINWAG_DEBUG is set and ps fails', () => {
      process.env.CHINWAG_DEBUG = '1';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      execFileSync.mockImplementation(() => {
        throw new Error('ps failed');
      });

      readProcessInfo(42);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[chinwag:process-utils] readProcessInfo(42) failed: ps failed'),
      );
      spy.mockRestore();
    });

    it('does not log when CHINWAG_DEBUG is not set and ps fails', () => {
      delete process.env.CHINWAG_DEBUG;
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      execFileSync.mockImplementation(() => {
        throw new Error('ps failed');
      });

      readProcessInfo(42);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('works on non-win32 platforms (linux)', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      execFileSync.mockReturnValue('  1 /bin/bash');

      const result = readProcessInfo(55);
      expect(result).toEqual({ ppid: 1, command: '/bin/bash' });
    });
  });

  describe('getProcessTtyPath', () => {
    it('returns /dev/<tty> when ps reports a tty', () => {
      execFileSync.mockReturnValue('ttys003\n');

      const result = getProcessTtyPath(42);
      expect(result).toBe('/dev/ttys003');
      expect(execFileSync).toHaveBeenCalledWith('ps', ['-o', 'tty=', '-p', '42'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
    });

    it('returns null when tty is "??" (no controlling terminal)', () => {
      execFileSync.mockReturnValue('??');

      const result = getProcessTtyPath(42);
      expect(result).toBeNull();
    });

    it('returns null when tty is "?" (no controlling terminal)', () => {
      execFileSync.mockReturnValue('?');

      const result = getProcessTtyPath(42);
      expect(result).toBeNull();
    });

    it('returns null when tty output is empty', () => {
      execFileSync.mockReturnValue('   \n');

      const result = getProcessTtyPath(42);
      expect(result).toBeNull();
    });

    it('returns null when execFileSync throws', () => {
      execFileSync.mockImplementation(() => {
        throw new Error('ps failed');
      });

      const result = getProcessTtyPath(42);
      expect(result).toBeNull();
    });

    it('handles pts-style tty names (Linux)', () => {
      execFileSync.mockReturnValue('pts/0\n');

      const result = getProcessTtyPath(42);
      expect(result).toBe('/dev/pts/0');
    });

    it('logs debug info when CHINWAG_DEBUG is set and ps fails', () => {
      process.env.CHINWAG_DEBUG = '1';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      execFileSync.mockImplementation(() => {
        throw new Error('tty lookup failed');
      });

      getProcessTtyPath(99);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[chinwag:process-utils] getProcessTtyPath(99) failed: tty lookup failed',
        ),
      );
      spy.mockRestore();
    });

    it('does not log when CHINWAG_DEBUG is not set and ps fails', () => {
      delete process.env.CHINWAG_DEBUG;
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      execFileSync.mockImplementation(() => {
        throw new Error('tty lookup failed');
      });

      getProcessTtyPath(99);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('getProcessCommandString', () => {
    it('returns the trimmed command string on success', () => {
      execFileSync.mockReturnValue('  /usr/bin/node server.js  \n');

      const result = getProcessCommandString(42);
      expect(result).toBe('/usr/bin/node server.js');
      expect(execFileSync).toHaveBeenCalledWith('ps', ['-o', 'command=', '-p', '42'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
    });

    it('returns an empty string when ps returns only whitespace', () => {
      execFileSync.mockReturnValue('  \n');

      const result = getProcessCommandString(42);
      expect(result).toBe('');
    });

    it('returns null when execFileSync throws (process not found)', () => {
      execFileSync.mockImplementation(() => {
        throw new Error('Command failed: ps');
      });

      const result = getProcessCommandString(42);
      expect(result).toBeNull();
    });

    it('handles commands with complex arguments', () => {
      execFileSync.mockReturnValue(
        '/usr/bin/python3 -u script.py --config=/etc/app.conf --verbose',
      );

      const result = getProcessCommandString(100);
      expect(result).toBe('/usr/bin/python3 -u script.py --config=/etc/app.conf --verbose');
    });

    it('logs debug info when CHINWAG_DEBUG is set and ps fails', () => {
      process.env.CHINWAG_DEBUG = '1';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      execFileSync.mockImplementation(() => {
        throw new Error('command lookup failed');
      });

      getProcessCommandString(77);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[chinwag:process-utils] getProcessCommandString(77) failed: command lookup failed',
        ),
      );
      spy.mockRestore();
    });

    it('does not log when CHINWAG_DEBUG is not set and ps fails', () => {
      delete process.env.CHINWAG_DEBUG;
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      execFileSync.mockImplementation(() => {
        throw new Error('command lookup failed');
      });

      getProcessCommandString(77);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('handles non-Error thrown values in debug log', () => {
      process.env.CHINWAG_DEBUG = '1';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      execFileSync.mockImplementation(() => {
        throw 'string error';  
      });

      getProcessCommandString(5);

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('string error'));
      spy.mockRestore();
    });
  });
});
