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

async function loadProjectView({ pollingState, teamState } = {}) {
  vi.resetModules();

  vi.doMock('../../lib/stores/polling.js', () => ({
    usePollingStore: (selector) => selector(pollingState),
    forceRefresh: vi.fn(),
  }));

  vi.doMock('../../lib/stores/teams.js', () => ({
    useTeamStore: (selector) => selector(teamState),
    teamActions: {
      updateMemory: vi.fn(),
      deleteMemory: vi.fn(),
    },
  }));

  vi.doMock('../../components/ActivityTimeline/ActivityTimeline.jsx', () => ({
    default: function MockActivityTimeline() {
      return <div data-testid="activity-timeline" />;
    },
  }));

  vi.doMock('../../components/StatusState/StatusState.jsx', () => ({
    default: function MockStatusState({ title }) {
      return <div data-testid="status-state">{title}</div>;
    },
  }));

  vi.doMock('../../components/ViewHeader/ViewHeader.jsx', () => ({
    default: function MockViewHeader({ title }) {
      return <div data-testid="view-header">{title}</div>;
    },
  }));

  vi.doMock('./ProjectTabParts.jsx', () => ({
    ProjectLiveTab: () => <div />,
    ProjectMemoryTab: () => <div />,
    ProjectSessionsTab: () => <div />,
    ProjectToolsTab: () => <div />,
  }));

  const mod = await import('./ProjectView.jsx');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ProjectView states', () => {
  it('replaces the normal project header with an unavailable state when context fails', async () => {
    const ProjectView = await loadProjectView({
      pollingState: {
        contextData: null,
        contextStatus: 'error',
        contextTeamId: 't_chinwag',
        pollError: 'Internal server error',
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        activeTeamId: 't_chinwag',
        teams: [{ team_id: 't_chinwag', team_name: 'chinwag' }],
      },
    });
    const { container, unmount } = renderComponent(ProjectView);

    expect(container.querySelector('[data-testid="status-state"]')?.textContent).toContain(
      'Could not load chinwag',
    );
    expect(container.querySelector('[data-testid="view-header"]')).toBeNull();

    unmount();
  });

  it('shows loading skeletons while context is being fetched', async () => {
    const ProjectView = await loadProjectView({
      pollingState: {
        contextData: null,
        contextStatus: 'loading',
        contextTeamId: 't_chinwag',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        activeTeamId: 't_chinwag',
        teams: [{ team_id: 't_chinwag', team_name: 'chinwag' }],
      },
    });
    const { container, unmount } = renderComponent(ProjectView);

    expect(container.textContent).toContain('Loading chinwag');
    expect(container.querySelector('[data-testid="status-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="view-header"]')).toBeNull();

    unmount();
  });

  it('shows loading skeletons when context status is idle with no data', async () => {
    const ProjectView = await loadProjectView({
      pollingState: {
        contextData: null,
        contextStatus: 'idle',
        contextTeamId: null,
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        activeTeamId: 't_chinwag',
        teams: [{ team_id: 't_chinwag', team_name: 'chinwag' }],
      },
    });
    const { container, unmount } = renderComponent(ProjectView);

    expect(container.textContent).toContain('Loading chinwag');

    unmount();
  });

  it('falls back to project ID when team name is not available', async () => {
    const ProjectView = await loadProjectView({
      pollingState: {
        contextData: null,
        contextStatus: 'error',
        contextTeamId: 't_unknown',
        pollError: 'Server error',
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        activeTeamId: 't_unknown',
        teams: [{ team_id: 't_unknown' }],
      },
    });
    const { container, unmount } = renderComponent(ProjectView);

    expect(container.querySelector('[data-testid="status-state"]')?.textContent).toContain(
      'Could not load t_unknown',
    );

    unmount();
  });

  it('shows loading when context belongs to a different team and status is still loading', async () => {
    const ProjectView = await loadProjectView({
      pollingState: {
        contextData: null,
        contextStatus: 'loading',
        contextTeamId: 't_new',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        activeTeamId: 't_new',
        teams: [{ team_id: 't_new', team_name: 'new-proj' }],
      },
    });
    const { container, unmount } = renderComponent(ProjectView);

    expect(container.textContent).toContain('Loading new-proj');
    expect(container.querySelector('[data-testid="view-header"]')).toBeNull();

    unmount();
  });
});
