// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

// router.ts is a singleton with module-level state, so we reset modules for each test.

async function loadRouter(pathname = '/') {
  vi.resetModules();
  // Set the pathname before the module initializes
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, pathname },
  });
  return import('./router.js');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseLocation', () => {
  it('returns overview for root path', async () => {
    const { parseLocation } = await loadRouter('/');
    expect(parseLocation()).toEqual({ view: 'overview', teamId: null });
  });

  it('returns overview for dashboard.html root', async () => {
    const { parseLocation } = await loadRouter('/dashboard.html/');
    expect(parseLocation()).toEqual({ view: 'overview', teamId: null });
  });

  it('returns settings view for /settings', async () => {
    const { parseLocation } = await loadRouter('/settings');
    expect(parseLocation()).toEqual({ view: 'settings', teamId: null });
  });

  it('returns tools view for /tools', async () => {
    const { parseLocation } = await loadRouter('/tools');
    expect(parseLocation()).toEqual({ view: 'tools', teamId: null });
  });

  it('returns project view with teamId for /project/:id', async () => {
    const { parseLocation } = await loadRouter('/project/t_abc123');
    expect(parseLocation()).toEqual({ view: 'project', teamId: 't_abc123' });
  });

  it('accepts hyphens in teamId', async () => {
    const { parseLocation } = await loadRouter('/project/my-team-id');
    expect(parseLocation()).toEqual({ view: 'project', teamId: 'my-team-id' });
  });

  it('accepts underscores in teamId', async () => {
    const { parseLocation } = await loadRouter('/project/team_123');
    expect(parseLocation()).toEqual({ view: 'project', teamId: 'team_123' });
  });

  it('falls through to overview for /project with no id', async () => {
    const { parseLocation } = await loadRouter('/project');
    expect(parseLocation()).toEqual({ view: 'overview', teamId: null });
  });

  it('rejects teamId with spaces (falls through to overview)', async () => {
    const { parseLocation } = await loadRouter('/project/bad%20id');
    // The segment after URL decode would be "bad id" which has a space,
    // but pathname encoding varies. The regex test should reject it.
    const result = parseLocation();
    // /project/bad%20id -> segments: ['project', 'bad%20id']
    // '%20' contains '%' which fails /^[\w-]+$/ test
    expect(result).toEqual({ view: 'overview', teamId: null });
  });

  it('returns overview for unknown paths', async () => {
    const { parseLocation } = await loadRouter('/unknown/path');
    expect(parseLocation()).toEqual({ view: 'overview', teamId: null });
  });

  it('strips dashboard.html prefix before parsing', async () => {
    const { parseLocation } = await loadRouter('/dashboard.html/settings');
    expect(parseLocation()).toEqual({ view: 'settings', teamId: null });
  });

  it('strips dashboard.html prefix for project routes', async () => {
    const { parseLocation } = await loadRouter('/dashboard.html/project/t_1');
    expect(parseLocation()).toEqual({ view: 'project', teamId: 't_1' });
  });
});

describe('navigate', () => {
  it('pushes history state for overview', async () => {
    const { navigate } = await loadRouter('/settings');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    navigate('overview');

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/');
  });

  it('pushes history state for project with teamId', async () => {
    const { navigate } = await loadRouter('/');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    navigate('project', 't_abc');

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/project/t_abc');
  });

  it('pushes history state for tools', async () => {
    const { navigate } = await loadRouter('/');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    navigate('tools');

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/tools');
  });

  it('pushes history state for settings', async () => {
    const { navigate } = await loadRouter('/');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    navigate('settings');

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/settings');
  });

  it('does not push if already at the same path', async () => {
    const { navigate } = await loadRouter('/tools');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    navigate('tools');

    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('falls back to overview for project view without teamId', async () => {
    const { navigate } = await loadRouter('/settings');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    navigate('project', null);

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/');
  });
});
