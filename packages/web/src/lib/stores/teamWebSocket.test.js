import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the WebSocket lifecycle inside the polling store.
 * Covers: ticket acquisition failure, team-changed-during-connect guard,
 * message routing (context + delta), and close handler fallback to polling.
 */

class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.readyState = 0;
    this.close = vi.fn(() => {
      this.readyState = 3;
    });
    MockWebSocket.instances.push(this);
  }
  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  simulateMessage(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  simulateClose() {
    this.readyState = 3;
    this.onclose?.();
  }
}

async function flushPromises(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

function createTeamState(activeTeamId) {
  return { activeTeamId };
}

async function loadPollingModuleWithWs({
  token = 'tok_ws',
  activeTeamId = 't_ws',
  apiMock = vi.fn(),
  ensureJoinedMock = vi.fn().mockResolvedValue({ ok: true }),
  loadTeamsMock = vi.fn(),
  logoutMock = vi.fn(),
  teamState = null,
} = {}) {
  vi.resetModules();
  MockWebSocket.instances = [];

  const resolvedTeamState = teamState || createTeamState(activeTeamId);

  // Remove document to avoid visibilitychange handler
  delete globalThis.document;

  globalThis.WebSocket = MockWebSocket;

  vi.doMock('../api.js', () => ({
    api: apiMock,
    getApiUrl: () => 'https://test.chinwag.dev',
  }));
  vi.doMock('./auth.js', () => ({
    authActions: {
      getState: () => ({ token }),
      logout: logoutMock,
    },
  }));
  vi.doMock('./teams.js', () => ({
    teamActions: {
      getState: () => resolvedTeamState,
      ensureJoined: ensureJoinedMock,
      loadTeams: loadTeamsMock,
    },
  }));

  const mod = await import('./polling.js');
  return { ...mod, apiMock, ensureJoinedMock, teamState: resolvedTeamState };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.document;
  delete globalThis.WebSocket;
});

describe('team WebSocket lifecycle', () => {
  it('falls back silently when ticket acquisition fails', async () => {
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) return { members: [] };
      if (path === '/auth/ws-ticket') throw new Error('ticket failed');
      return {};
    });
    const { startPolling, stopPolling, pollingActions } = await loadPollingModuleWithWs({
      apiMock,
    });

    startPolling();
    await flushPromises();

    // Context loaded successfully via polling
    expect(pollingActions.getState().contextStatus).toBe('ready');
    // No WebSocket was created since ticket failed
    expect(MockWebSocket.instances).toHaveLength(0);

    stopPolling();
  });

  it('aborts the WebSocket connection when the team changes during ticket fetch', async () => {
    const teamState = createTeamState('t_ws');
    let ticketResolve;
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) return { members: [] };
      if (path === '/auth/ws-ticket') {
        return new Promise((resolve) => {
          ticketResolve = resolve;
        });
      }
      return {};
    });

    const { startPolling, stopPolling } = await loadPollingModuleWithWs({
      apiMock,
      teamState,
    });

    startPolling();
    await flushPromises();

    // Switch teams while ticket fetch is in-flight
    teamState.activeTeamId = 't_other';
    ticketResolve({ ticket: 'tk_stale' });
    await flushPromises();

    // WebSocket should not have been created because team changed
    expect(MockWebSocket.instances).toHaveLength(0);

    stopPolling();
  });

  it('routes a full context message to the polling store', async () => {
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) return { members: [{ agent_id: 'a1', status: 'active' }] };
      if (path === '/auth/ws-ticket') return { ticket: 'tk_test' };
      return {};
    });

    const { startPolling, stopPolling, pollingActions } = await loadPollingModuleWithWs({
      apiMock,
    });

    startPolling();
    await flushPromises();

    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Send a full context snapshot via WebSocket
    ws.simulateMessage({
      type: 'context',
      data: { members: [{ agent_id: 'a2', status: 'active', handle: 'bob' }] },
    });

    expect(pollingActions.getState().contextData).toMatchObject({
      members: [expect.objectContaining({ agent_id: 'a2', status: 'active', handle: 'bob' })],
    });
    expect(pollingActions.getState().contextStatus).toBe('ready');
    expect(pollingActions.getState().pollError).toBeNull();

    stopPolling();
  });

  it('routes a delta message through applyDelta', async () => {
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) {
        return { members: [{ agent_id: 'a1', handle: 'alice', status: 'active' }] };
      }
      if (path === '/auth/ws-ticket') return { ticket: 'tk_test' };
      return {};
    });

    const { startPolling, stopPolling, pollingActions } = await loadPollingModuleWithWs({
      apiMock,
    });

    startPolling();
    await flushPromises();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Send a delta event (member_joined)
    ws.simulateMessage({
      type: 'member_joined',
      agent_id: 'a2',
      handle: 'bob',
      tool: 'cursor',
    });

    const members = pollingActions.getState().contextData.members;
    expect(members).toHaveLength(2);
    expect(members[1]).toMatchObject({ agent_id: 'a2', handle: 'bob', host_tool: 'cursor' });

    stopPolling();
  });

  it('falls back to polling when the WebSocket closes', async () => {
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) return { members: [] };
      if (path === '/auth/ws-ticket') return { ticket: 'tk_test' };
      return {};
    });

    const { startPolling, stopPolling } = await loadPollingModuleWithWs({
      apiMock,
    });

    startPolling();
    await flushPromises();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Clear call count to track new polls after WS close
    apiMock.mockClear();
    apiMock.mockResolvedValue({ members: [{ agent_id: 'a3', status: 'active' }] });

    // Simulate WebSocket close
    ws.simulateClose();

    // Advance timer past the poll interval to trigger fallback polling
    vi.advanceTimersByTime(6000);
    await flushPromises();

    // Should have polled at least once after WS close
    const contextCalls = apiMock.mock.calls.filter((call) => call[1]?.includes('/context'));
    expect(contextCalls.length).toBeGreaterThanOrEqual(1);

    stopPolling();
  });

  it('closes the WebSocket immediately if team changes during onopen', async () => {
    const teamState = createTeamState('t_ws');
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) return { members: [] };
      if (path === '/auth/ws-ticket') return { ticket: 'tk_test' };
      return {};
    });

    const { startPolling, stopPolling } = await loadPollingModuleWithWs({
      apiMock,
      teamState,
    });

    startPolling();
    await flushPromises();

    const ws = MockWebSocket.instances[0];

    // Change team before onopen fires
    teamState.activeTeamId = 't_different';
    ws.simulateOpen();

    expect(ws.close).toHaveBeenCalled();

    stopPolling();
  });

  it('ignores WebSocket messages when team has changed', async () => {
    const teamState = createTeamState('t_ws');
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) return { members: [] };
      if (path === '/auth/ws-ticket') return { ticket: 'tk_test' };
      return {};
    });

    const { startPolling, stopPolling, pollingActions } = await loadPollingModuleWithWs({
      apiMock,
      teamState,
    });

    startPolling();
    await flushPromises();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Change team after WS is open
    teamState.activeTeamId = 't_other';

    // Send a context message -- should be ignored
    ws.simulateMessage({
      type: 'context',
      data: { members: [{ agent_id: 'rogue', handle: 'rogue' }] },
    });

    // Context data should still be the original polling result for t_ws, not the rogue message
    const data = pollingActions.getState().contextData;
    expect(data?.members?.some((m) => m.agent_id === 'rogue')).toBeFalsy();

    stopPolling();
  });

  it('does not restart polling on close if team has already changed', async () => {
    const teamState = createTeamState('t_ws');
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) return { members: [] };
      if (path === '/auth/ws-ticket') return { ticket: 'tk_test' };
      return {};
    });

    const { startPolling, stopPolling } = await loadPollingModuleWithWs({
      apiMock,
      teamState,
    });

    startPolling();
    await flushPromises();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Clear call counts after initial setup
    apiMock.mockClear();

    // Change team, then simulate close
    teamState.activeTeamId = null;
    ws.simulateClose();

    // Advance timers -- no polling should happen because we moved away from the team
    vi.advanceTimersByTime(10000);
    await flushPromises();

    const contextCalls = apiMock.mock.calls.filter((call) =>
      call[1]?.includes(`/teams/t_ws/context`),
    );
    expect(contextCalls).toHaveLength(0);

    stopPolling();
  });

  it('stops polling once WebSocket connects and starts reconciliation timer', async () => {
    const apiMock = vi.fn().mockImplementation(async (method, path) => {
      if (path.includes('/context')) return { members: [] };
      if (path === '/auth/ws-ticket') return { ticket: 'tk_test' };
      return {};
    });

    const { startPolling, stopPolling } = await loadPollingModuleWithWs({ apiMock });

    startPolling();
    await flushPromises();

    const ws = MockWebSocket.instances[0];

    // Clear call count after initial poll
    apiMock.mockClear();
    ws.simulateOpen();

    // Short-interval polling should be stopped. Advance past normal poll interval.
    vi.advanceTimersByTime(15000);
    await flushPromises();

    // No polls in the 5s interval
    const shortPollCalls = apiMock.mock.calls.filter((call) => call[1]?.includes('/context'));
    expect(shortPollCalls).toHaveLength(0);

    // Advance past reconciliation interval (60s)
    apiMock.mockClear();
    vi.advanceTimersByTime(60000);
    await flushPromises();

    // One reconciliation poll
    const reconcileCalls = apiMock.mock.calls.filter((call) => call[1]?.includes('/context'));
    expect(reconcileCalls.length).toBeGreaterThanOrEqual(1);

    stopPolling();
  });
});
