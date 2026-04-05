import { describe, it, expect } from 'vitest';
import {
  normalizeRuntimeProfile,
  isLoopbackUrl,
  getDefaultDashboardPath,
  coerceDashboardUrl,
  resolveRuntimeProfile,
  toWebSocketOrigin,
  resolveRuntimeTargets,
  DEFAULT_API_URL,
  DEFAULT_DASHBOARD_URL,
  LOCAL_API_URL,
  LOCAL_DASHBOARD_URL,
} from '../runtime-profile.js';

describe('normalizeRuntimeProfile', () => {
  it('normalizes "prod" to "prod"', () => {
    expect(normalizeRuntimeProfile('prod')).toBe('prod');
  });

  it('normalizes "production" to "prod"', () => {
    expect(normalizeRuntimeProfile('production')).toBe('prod');
  });

  it('normalizes "local" to "local"', () => {
    expect(normalizeRuntimeProfile('local')).toBe('local');
  });

  it('normalizes "dev" to "local"', () => {
    expect(normalizeRuntimeProfile('dev')).toBe('local');
  });

  it('normalizes "development" to "local"', () => {
    expect(normalizeRuntimeProfile('development')).toBe('local');
  });

  it('normalizes "test" to "local"', () => {
    expect(normalizeRuntimeProfile('test')).toBe('local');
  });

  it('is case-insensitive', () => {
    expect(normalizeRuntimeProfile('PROD')).toBe('prod');
    expect(normalizeRuntimeProfile('Production')).toBe('prod');
    expect(normalizeRuntimeProfile('LOCAL')).toBe('local');
    expect(normalizeRuntimeProfile('Dev')).toBe('local');
  });

  it('trims whitespace', () => {
    expect(normalizeRuntimeProfile('  prod  ')).toBe('prod');
    expect(normalizeRuntimeProfile(' local ')).toBe('local');
  });

  it('returns null for null', () => {
    expect(normalizeRuntimeProfile(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeRuntimeProfile(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeRuntimeProfile('')).toBeNull();
  });

  it('returns null for unrecognized values', () => {
    expect(normalizeRuntimeProfile('garbage')).toBeNull();
    expect(normalizeRuntimeProfile('staging')).toBeNull();
    expect(normalizeRuntimeProfile('preview')).toBeNull();
  });
});

describe('isLoopbackUrl', () => {
  it('returns true for localhost URL', () => {
    expect(isLoopbackUrl('http://localhost:8787')).toBe(true);
    expect(isLoopbackUrl('https://localhost')).toBe(true);
    expect(isLoopbackUrl('http://localhost/path')).toBe(true);
  });

  it('returns true for 127.0.0.1 URL', () => {
    expect(isLoopbackUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isLoopbackUrl('https://127.0.0.1')).toBe(true);
  });

  it('returns false for ::1 URL (IPv6 bracket notation not matched)', () => {
    // Node URL parser produces hostname "[::1]" which doesn't match "::1"
    expect(isLoopbackUrl('http://[::1]:8787')).toBe(false);
    expect(isLoopbackUrl('http://[::1]')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isLoopbackUrl(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isLoopbackUrl(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isLoopbackUrl('')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isLoopbackUrl('not a url')).toBe(false);
  });

  it('returns false for remote URL', () => {
    expect(isLoopbackUrl('https://chinwag-api.glendonchin.workers.dev')).toBe(false);
    expect(isLoopbackUrl('https://example.com')).toBe(false);
  });
});

describe('getDefaultDashboardPath', () => {
  it('returns /dashboard for prod', () => {
    expect(getDefaultDashboardPath('prod')).toBe('/dashboard');
  });

  it('returns /dashboard.html for local', () => {
    expect(getDefaultDashboardPath('local')).toBe('/dashboard.html');
  });
});

describe('coerceDashboardUrl', () => {
  it('appends default prod path when URL has no path', () => {
    expect(coerceDashboardUrl('https://chinwag.dev', 'prod')).toBe('https://chinwag.dev/dashboard');
  });

  it('appends default local path when URL has no path', () => {
    expect(coerceDashboardUrl('http://localhost:56790', 'local')).toBe(
      'http://localhost:56790/dashboard.html',
    );
  });

  it('appends default path when URL has only root slash', () => {
    expect(coerceDashboardUrl('https://chinwag.dev/', 'prod')).toBe(
      'https://chinwag.dev/dashboard',
    );
  });

  it('preserves existing non-root path', () => {
    expect(coerceDashboardUrl('http://localhost:56790/custom', 'local')).toBe(
      'http://localhost:56790/custom',
    );
  });

  it('preserves existing dashboard path', () => {
    expect(coerceDashboardUrl('https://chinwag.dev/dashboard', 'prod')).toBe(
      'https://chinwag.dev/dashboard',
    );
  });

  it('defaults to prod profile when profile is omitted', () => {
    const result = coerceDashboardUrl('https://chinwag.dev');
    expect(result).toBe('https://chinwag.dev/dashboard');
  });
});

describe('resolveRuntimeProfile', () => {
  it('defaults to prod when no options given', () => {
    expect(resolveRuntimeProfile()).toBe('prod');
    expect(resolveRuntimeProfile({})).toBe('prod');
  });

  it('uses explicit profile when provided', () => {
    expect(resolveRuntimeProfile({ profile: 'local' })).toBe('local');
    expect(resolveRuntimeProfile({ profile: 'development' })).toBe('local');
    expect(resolveRuntimeProfile({ profile: 'production' })).toBe('prod');
    expect(resolveRuntimeProfile({ profile: 'test' })).toBe('local');
  });

  it('detects local from loopback apiUrl', () => {
    expect(resolveRuntimeProfile({ apiUrl: 'http://localhost:8787' })).toBe('local');
  });

  it('detects local from loopback dashboardUrl', () => {
    expect(resolveRuntimeProfile({ dashboardUrl: 'http://127.0.0.1:56790' })).toBe('local');
  });

  it('detects local from loopback chatWsUrl', () => {
    expect(resolveRuntimeProfile({ chatWsUrl: 'ws://localhost:8787/ws/chat' })).toBe('local');
  });

  it('explicit profile takes priority over loopback detection', () => {
    expect(resolveRuntimeProfile({ profile: 'prod', apiUrl: 'http://localhost:8787' })).toBe(
      'prod',
    );
  });

  it('returns prod for remote URLs with no explicit profile', () => {
    expect(resolveRuntimeProfile({ apiUrl: 'https://chinwag-api.glendonchin.workers.dev' })).toBe(
      'prod',
    );
  });
});

describe('toWebSocketOrigin', () => {
  it('converts https to wss', () => {
    expect(toWebSocketOrigin('https://chinwag-api.glendonchin.workers.dev')).toBe(
      'wss://chinwag-api.glendonchin.workers.dev',
    );
  });

  it('converts http to ws', () => {
    expect(toWebSocketOrigin('http://localhost:8787')).toBe('ws://localhost:8787');
  });

  it('strips path from URL', () => {
    expect(toWebSocketOrigin('https://example.com/api/v1')).toBe('wss://example.com');
  });

  it('strips query string from URL', () => {
    expect(toWebSocketOrigin('https://example.com?token=abc')).toBe('wss://example.com');
  });

  it('strips hash from URL', () => {
    expect(toWebSocketOrigin('https://example.com#section')).toBe('wss://example.com');
  });

  it('strips path, query, and hash together', () => {
    expect(toWebSocketOrigin('https://example.com/path?q=1#hash')).toBe('wss://example.com');
  });

  it('preserves port', () => {
    expect(toWebSocketOrigin('http://localhost:3000/path')).toBe('ws://localhost:3000');
  });
});

describe('resolveRuntimeTargets', () => {
  it('returns prod defaults when no options given', () => {
    const targets = resolveRuntimeTargets();
    expect(targets).toMatchObject({
      profile: 'prod',
      apiUrl: DEFAULT_API_URL,
      dashboardUrl: DEFAULT_DASHBOARD_URL,
      teamWsOrigin: 'wss://chinwag-api.glendonchin.workers.dev',
      chatWsUrl: 'wss://chinwag-api.glendonchin.workers.dev/ws/chat',
    });
  });

  it('returns local defaults when profile is local', () => {
    const targets = resolveRuntimeTargets({ profile: 'local' });
    expect(targets).toMatchObject({
      profile: 'local',
      apiUrl: LOCAL_API_URL,
      dashboardUrl: LOCAL_DASHBOARD_URL,
      dashboardOrigin: 'http://localhost:56790',
      dashboardPath: '/dashboard.html',
      teamWsOrigin: 'ws://localhost:8787',
      chatWsUrl: 'ws://localhost:8787/ws/chat',
    });
  });

  it('uses custom apiUrl override', () => {
    const targets = resolveRuntimeTargets({
      profile: 'prod',
      apiUrl: 'https://custom-api.example.com',
    });
    expect(targets.apiUrl).toBe('https://custom-api.example.com');
    expect(targets.teamWsOrigin).toBe('wss://custom-api.example.com');
    expect(targets.chatWsUrl).toBe('wss://custom-api.example.com/ws/chat');
  });

  it('uses custom dashboardUrl override', () => {
    const targets = resolveRuntimeTargets({
      profile: 'prod',
      dashboardUrl: 'https://custom.example.com/my-dash',
    });
    expect(targets.dashboardUrl).toBe('https://custom.example.com/my-dash');
    expect(targets.dashboardOrigin).toBe('https://custom.example.com');
    expect(targets.dashboardPath).toBe('/my-dash');
  });

  it('uses custom chatWsUrl override', () => {
    const targets = resolveRuntimeTargets({
      profile: 'prod',
      chatWsUrl: 'wss://custom-ws.example.com/ws/chat',
    });
    expect(targets.chatWsUrl).toBe('wss://custom-ws.example.com/ws/chat');
  });

  it('derives dashboardOrigin and dashboardPath from dashboardUrl', () => {
    const targets = resolveRuntimeTargets();
    expect(targets.dashboardOrigin).toBe('https://chinwag.dev');
    expect(targets.dashboardPath).toBe('/dashboard');
  });

  it('derives chatWsUrl from apiUrl when not explicitly provided', () => {
    const targets = resolveRuntimeTargets({ profile: 'local' });
    expect(targets.chatWsUrl).toBe('ws://localhost:8787/ws/chat');
  });
});
