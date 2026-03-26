import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getApiUrl } from './api.js';

function mockJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('web API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the Vite API override and auth header', async () => {
    vi.stubEnv('VITE_CHINWAG_API_URL', 'http://localhost:8787');
    fetch.mockResolvedValue(mockJsonResponse({ teams: [] }));

    await api('GET', '/me/teams', null, 'web-token');

    expect(getApiUrl()).toBe('http://localhost:8787');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8787/me/teams',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer web-token',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('uses web-specific parse errors for non-JSON responses', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
    });

    await expect(api('GET', '/me')).rejects.toMatchObject({
      message: 'HTTP 500 (server error)',
      status: 500,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
