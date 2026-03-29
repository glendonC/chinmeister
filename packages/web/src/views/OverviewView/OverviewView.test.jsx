// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderComponent(Component) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Component />);
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function loadOverviewView({
  pollingState,
  authState = { user: { handle: 'alice', color: 'cyan' } },
  teamState = { teams: [], teamsError: null, selectTeam: vi.fn() },
} = {}) {
  vi.resetModules();

  vi.doMock('../../lib/stores/polling.js', () => ({
    usePollingStore: (selector) => selector(pollingState),
    forceRefresh: vi.fn(),
  }));

  vi.doMock('../../lib/stores/auth.js', () => ({
    useAuthStore: (selector) => selector(authState),
  }));

  vi.doMock('../../lib/stores/teams.js', () => ({
    useTeamStore: (selector) => selector(teamState),
  }));

  vi.doMock('../../components/EmptyState/EmptyState.jsx', () => ({
    default: function MockEmptyState({ title }) {
      return <div data-testid="empty-state">{title}</div>;
    },
  }));

  vi.doMock('../../components/StatusState/StatusState.jsx', () => ({
    default: function MockStatusState({ title, hint }) {
      return <div data-testid="status-state">{title}::{hint}</div>;
    },
  }));

  const mod = await import('./OverviewView.jsx');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('OverviewView states', () => {
  it('shows unavailable state when projects exist but overview summaries are missing', async () => {
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: { teams: [], failed_teams: [{ team_id: 't_one', team_name: 'chinwag' }] },
        dashboardStatus: 'ready',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        teams: [{ team_id: 't_one', team_name: 'chinwag' }],
        teamsError: null,
        selectTeam: vi.fn(),
      },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.querySelector('[data-testid="status-state"]')?.textContent).toContain('Could not load project overview');
    expect(container.querySelector('[data-testid="empty-state"]')).toBeNull();

    unmount();
  });

  it('shows the empty state only when there are no known projects', async () => {
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: { teams: [], failed_teams: [] },
        dashboardStatus: 'ready',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        teams: [],
        teamsError: null,
        selectTeam: vi.fn(),
      },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toContain('No projects yet');
    expect(container.querySelector('[data-testid="status-state"]')).toBeNull();

    unmount();
  });
});
