import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function startCliApiServer() {
  const state = {
    initCalls: 0,
    teamCreates: 0,
    directoryCalls: 0,
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const method = request.method || 'GET';

    if (method === 'POST' && url.pathname === '/auth/init') {
      state.initCalls += 1;
      return json(response, 201, {
        token: 'tok_cli_init',
        handle: 'alice_cli',
        color: 'cyan',
        refresh_token: 'refresh_cli_init',
      });
    }

    if (method === 'POST' && url.pathname === '/teams') {
      state.teamCreates += 1;
      return json(response, 201, { team_id: 't_cli_init' });
    }

    if (method === 'GET' && url.pathname === '/tools/directory') {
      state.directoryCalls += 1;
      return json(response, 200, {
        categories: {
          'coding-agent': 'Coding agents',
        },
        evaluations: [
          {
            id: 'cursor',
            name: 'Cursor',
            category: 'coding-agent',
            verdict: 'integrated',
            tagline: 'AI-native code editor',
            mcp_support: true,
            metadata: {
              website: 'https://cursor.com',
              install_command: 'brew install cursor',
              featured: true,
            },
          },
        ],
      });
    }

    return json(response, 404, { error: `Unhandled route: ${method} ${url.pathname}` });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  if (!port) throw new Error('Failed to bind CLI integration API server');

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    state,
    async close() {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

async function loadCliCommands(homeDir, apiUrl) {
  vi.resetModules();
  process.env.HOME = homeDir;
  process.env.CHINWAG_API_URL = apiUrl;

  const [{ runInit }, { runAdd }] = await Promise.all([
    import('../commands/init.js'),
    import('../commands/add.js'),
  ]);

  return { runInit, runAdd };
}

describe('cli command flow integration', () => {
  const originalHome = process.env.HOME;
  const originalApiUrl = process.env.CHINWAG_API_URL;
  const originalCwd = process.cwd();
  const tempDirs = [];

  afterEach(() => {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    if (originalApiUrl === undefined) {
      delete process.env.CHINWAG_API_URL;
    } else {
      process.env.CHINWAG_API_URL = originalApiUrl;
    }
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runInit creates account config and the project team file', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'chinwag-cli-home-'));
    const repoDir = mkdtempSync(join(tmpdir(), 'chinwag-cli-repo-'));
    tempDirs.push(homeDir, repoDir);

    const fakeApi = await startCliApiServer();
    try {
      const { runInit } = await loadCliCommands(homeDir, fakeApi.baseUrl);
      process.chdir(repoDir);
      await runInit();

      const config = JSON.parse(readFileSync(join(homeDir, '.chinwag', 'config.json'), 'utf-8'));
      const teamFile = JSON.parse(readFileSync(join(repoDir, '.chinwag'), 'utf-8'));

      expect(config).toMatchObject({
        token: 'tok_cli_init',
        handle: 'alice_cli',
        color: 'cyan',
        refresh_token: 'refresh_cli_init',
      });
      expect(teamFile).toMatchObject({
        team: 't_cli_init',
      });
      expect(fakeApi.state.initCalls).toBe(1);
      expect(fakeApi.state.teamCreates).toBe(1);
    } finally {
      await fakeApi.close();
    }
  });

  it('runAdd --list fetches the tool directory from the configured API', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'chinwag-cli-home-'));
    const repoDir = mkdtempSync(join(tmpdir(), 'chinwag-cli-repo-'));
    tempDirs.push(homeDir, repoDir);
    mkdirSync(join(homeDir, '.chinwag'), { recursive: true });
    vi.resetModules();

    const fakeApi = await startCliApiServer();
    const logs = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    try {
      const { runAdd } = await loadCliCommands(homeDir, fakeApi.baseUrl);
      process.chdir(repoDir);
      await runAdd('--list');

      expect(fakeApi.state.directoryCalls).toBe(1);
      expect(logs.join('\n')).toContain('cursor');
      expect(logs.join('\n')).toContain('AI-native code editor');
      logSpy.mockRestore();
    } finally {
      await fakeApi.close();
    }
  });
});
