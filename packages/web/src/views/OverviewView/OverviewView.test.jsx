// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { shallow } from 'zustand/vanilla/shallow';
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

const DEFAULT_ANALYTICS = {
  ok: true,
  period_days: 30,
  file_heatmap: [],
  daily_trends: [],
  tool_distribution: [],
  outcome_distribution: [],
  daily_metrics: [],
  hourly_distribution: [],
  model_outcomes: [],
  tool_outcomes: [],
  teams_included: 0,
  degraded: false,
  truncated_teams: 0,
};

async function loadOverviewView({
  pollingState,
  authState = { user: { handle: 'alice', color: 'cyan' } },
  teamState = { teams: [], teamsError: null, selectTeam: vi.fn() },
  analyticsOverride = null,
} = {}) {
  vi.resetModules();

  // Pin zustand/react/shallow to use the statically imported React instance.
  // Without this, vi.resetModules() causes zustand to load a second React copy.
  vi.doMock('zustand/react/shallow', () => ({
    useShallow: (selector) => {
      const prev = React.useRef(undefined);
      return (state) => {
        const next = selector(state);
        return shallow(prev.current, next) ? prev.current : (prev.current = next);
      };
    },
  }));

  vi.doMock('../../lib/stores/polling.js', () => ({
    usePollingStore: (selector) => selector(pollingState),
    forceRefresh: vi.fn(),
  }));

  vi.doMock('../../lib/stores/auth.js', () => ({
    useAuthStore: (selector) => selector(authState),
    authActions: { subscribe: () => () => {}, getState: () => authState },
  }));

  vi.doMock('../../lib/stores/teams.js', () => ({
    useTeamStore: (selector) => selector(teamState),
  }));

  vi.doMock('../../hooks/useSessionTimeline.js', () => ({
    useSessionTimeline: () => ({
      sessions: [],
      totals: { sessions: 0, edits: 0, lines_added: 0, lines_removed: 0, tools: [] },
      isLoading: false,
      error: null,
    }),
  }));

  vi.doMock('../../hooks/useUserAnalytics.js', () => ({
    useUserAnalytics: () => ({
      analytics: { ...DEFAULT_ANALYTICS, ...(analyticsOverride ?? {}) },
      isLoading: false,
      error: null,
    }),
  }));

  // Mock @dnd-kit/core + WidgetGrid + WidgetCatalog: vi.resetModules()
  // reloads dnd-kit but not the top-level `import React` in this test
  // file, so dnd-kit's internal `useRef` calls see a null React
  // dispatcher and crash. None of these surfaces carry any of the
  // assertions these tests target (we're checking the truncation /
  // period-clamp banners, which live in OverviewView itself), so
  // pass-through stubs keep the rendering path live without dragging
  // the harness through the dnd-kit bootstrap.
  vi.doMock('@dnd-kit/core', () => ({
    DndContext: ({ children }) => <div>{children}</div>,
    DragOverlay: ({ children }) => <div>{children}</div>,
    PointerSensor: function PointerSensor() {},
    KeyboardSensor: function KeyboardSensor() {},
    useSensor: () => null,
    useSensors: () => [],
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
    useDraggable: () => ({
      setNodeRef: () => {},
      attributes: {},
      listeners: {},
      transform: null,
      isDragging: false,
    }),
  }));
  vi.doMock('@dnd-kit/sortable', () => ({
    arrayMove: (arr) => arr,
    SortableContext: ({ children }) => <div>{children}</div>,
    useSortable: () => ({
      setNodeRef: () => {},
      attributes: {},
      listeners: {},
      transform: null,
      transition: null,
      isDragging: false,
    }),
  }));
  vi.doMock('@dnd-kit/utilities', () => ({
    CSS: { Translate: { toString: () => '' }, Transform: { toString: () => '' } },
    getEventCoordinates: () => ({ x: 0, y: 0 }),
  }));
  vi.doMock('../../components/WidgetGrid/WidgetGrid.js', () => ({
    WidgetGrid: function MockWidgetGrid() {
      return <div data-testid="widget-grid" />;
    },
    GRID_DROPPABLE_ID: 'grid-droppable',
    snapChipToCursor: () => null,
  }));
  vi.doMock('../../widgets/WidgetCatalog.js', () => ({
    WidgetCatalog: function MockWidgetCatalog() {
      return null;
    },
  }));

  vi.doMock('../../components/EmptyState/EmptyState.js', () => ({
    default: function MockEmptyState({ title }) {
      return <div data-testid="empty-state">{title}</div>;
    },
  }));

  vi.doMock('../../components/StatusState/StatusState.js', () => ({
    default: function MockStatusState({ title, hint }) {
      return (
        <div data-testid="status-state">
          {title}::{hint}
        </div>
      );
    },
  }));

  const mod = await import('./OverviewView.js');
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
        dashboardData: {
          teams: [],
          failed_teams: [{ team_id: 't_one', team_name: 'chinmeister' }],
        },
        dashboardStatus: 'ready',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        teams: [{ team_id: 't_one', team_name: 'chinmeister' }],
        teamsError: null,
        selectTeam: vi.fn(),
      },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.querySelector('[data-testid="status-state"]')?.textContent).toContain(
      'Could not load project overview',
    );
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

    expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toContain(
      'No projects yet',
    );
    expect(container.querySelector('[data-testid="status-state"]')).toBeNull();

    unmount();
  });

  it('shows loading skeletons while dashboard data is being fetched', async () => {
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: null,
        dashboardStatus: 'loading',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
    });
    const { container, unmount } = renderComponent(OverviewView);

    // Should show the shimmer loading text
    expect(container.textContent).toContain('Loading your projects');
    // Should not show data views or error states
    expect(container.querySelector('[data-testid="status-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="empty-state"]')).toBeNull();

    unmount();
  });

  it('shows loading skeletons when dashboard status is idle with no data', async () => {
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: null,
        dashboardStatus: 'idle',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.textContent).toContain('Loading your projects');

    unmount();
  });

  it('shows unavailable state when dashboardStatus is error', async () => {
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: null,
        dashboardStatus: 'error',
        pollError: 'Internal server error',
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

    expect(container.querySelector('[data-testid="status-state"]')?.textContent).toContain(
      'Could not load project overview',
    );

    unmount();
  });

  it('renders truncation notice when truncated_teams > 0', async () => {
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: {
          teams: [{ team_id: 't1', team_name: 'one' }],
          failed_teams: [],
        },
        dashboardStatus: 'ready',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        teams: [{ team_id: 't1', team_name: 'one' }],
        teamsError: null,
        selectTeam: vi.fn(),
      },
      analyticsOverride: { teams_included: 25, truncated_teams: 3 },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.textContent).toContain('Projects capped');
    expect(container.textContent).toContain('Showing 25 of 28 projects');

    unmount();
  });

  it('does not render truncation notice when truncated_teams === 0', async () => {
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: {
          teams: [{ team_id: 't1', team_name: 'one' }],
          failed_teams: [],
        },
        dashboardStatus: 'ready',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        teams: [{ team_id: 't1', team_name: 'one' }],
        teamsError: null,
        selectTeam: vi.fn(),
      },
      analyticsOverride: { teams_included: 1, truncated_teams: 0 },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.textContent).not.toContain('Projects capped');

    unmount();
  });

  it('renders period clamp notice when period_days < requested range', async () => {
    // Default rangeDays is 30; the response carries period_days=30. The
    // banner only fires when the response window is SHORTER than the
    // selected range - simulate that by feeding period_days=7.
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: {
          teams: [{ team_id: 't1', team_name: 'one' }],
          failed_teams: [],
        },
        dashboardStatus: 'ready',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        teams: [{ team_id: 't1', team_name: 'one' }],
        teamsError: null,
        selectTeam: vi.fn(),
      },
      analyticsOverride: { teams_included: 1, truncated_teams: 0, period_days: 7 },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.textContent).toContain('Range capped');
    expect(container.textContent).toContain('Showing the last 7 days');

    unmount();
  });

  it('does not render period clamp notice when period_days matches range', async () => {
    const OverviewView = await loadOverviewView({
      pollingState: {
        dashboardData: {
          teams: [{ team_id: 't1', team_name: 'one' }],
          failed_teams: [],
        },
        dashboardStatus: 'ready',
        pollError: null,
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        teams: [{ team_id: 't1', team_name: 'one' }],
        teamsError: null,
        selectTeam: vi.fn(),
      },
      analyticsOverride: { teams_included: 1, truncated_teams: 0, period_days: 30 },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.textContent).not.toContain('Range capped');

    unmount();
  });

  it('surfaces team load errors in the empty state', async () => {
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
        teamsError: 'Cannot reach server to load projects.',
        selectTeam: vi.fn(),
      },
    });
    const { container, unmount } = renderComponent(OverviewView);

    expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toContain(
      'Could not load projects',
    );

    unmount();
  });
});
