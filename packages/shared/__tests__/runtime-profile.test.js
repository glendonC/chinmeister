import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_URL,
  DEFAULT_DASHBOARD_URL,
  LOCAL_API_URL,
  LOCAL_DASHBOARD_URL,
  coerceDashboardUrl,
  resolveRuntimeProfile,
  resolveRuntimeTargets,
  toWebSocketOrigin,
} from '../runtime-profile.js';

describe('runtime-profile', () => {
  it('defaults to the production profile', () => {
    expect(resolveRuntimeProfile()).toBe('prod');
    expect(resolveRuntimeTargets()).toMatchObject({
      profile: 'prod',
      apiUrl: DEFAULT_API_URL,
      dashboardUrl: DEFAULT_DASHBOARD_URL,
      teamWsOrigin: 'wss://chinwag-api.glendonchin.workers.dev',
      chatWsUrl: 'wss://chinwag-api.glendonchin.workers.dev/ws/chat',
    });
  });

  it('resolves the local profile from explicit profile input', () => {
    expect(resolveRuntimeProfile({ profile: 'local' })).toBe('local');
    expect(resolveRuntimeProfile({ profile: 'development' })).toBe('local');
    expect(resolveRuntimeProfile({ profile: 'production' })).toBe('prod');
  });

  it('infers the local profile from loopback URLs', () => {
    expect(resolveRuntimeProfile({ apiUrl: 'http://localhost:8787' })).toBe('local');
    expect(resolveRuntimeProfile({ dashboardUrl: 'http://127.0.0.1:56790' })).toBe('local');
    expect(resolveRuntimeProfile({ chatWsUrl: 'ws://localhost:8787/ws/chat' })).toBe('local');
  });

  it('resolves local targets with local defaults', () => {
    expect(resolveRuntimeTargets({ profile: 'local' })).toMatchObject({
      profile: 'local',
      apiUrl: LOCAL_API_URL,
      dashboardUrl: LOCAL_DASHBOARD_URL,
      dashboardOrigin: 'http://localhost:56790',
      dashboardPath: '/dashboard.html',
      teamWsOrigin: 'ws://localhost:8787',
      chatWsUrl: 'ws://localhost:8787/ws/chat',
    });
  });

  it('coerces dashboard origins into the correct dashboard path for each profile', () => {
    expect(coerceDashboardUrl('https://chinwag.dev', 'prod')).toBe('https://chinwag.dev/dashboard');
    expect(coerceDashboardUrl('http://localhost:56790', 'local')).toBe(
      'http://localhost:56790/dashboard.html',
    );
    expect(coerceDashboardUrl('http://localhost:56790/custom', 'local')).toBe(
      'http://localhost:56790/custom',
    );
  });

  it('derives websocket origins from API origins', () => {
    expect(toWebSocketOrigin('https://chinwag-api.glendonchin.workers.dev')).toBe(
      'wss://chinwag-api.glendonchin.workers.dev',
    );
    expect(toWebSocketOrigin('http://localhost:8787')).toBe('ws://localhost:8787');
  });
});
