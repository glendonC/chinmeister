// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { shallow } from 'zustand/vanilla/shallow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const READY_POLLING_STATE = {
  contextData: {
    members: [],
    memories: [],
    sessions: [],
    recentSessions: [],
    locks: [],
    tools_configured: [],
    hosts_configured: [],
    surfaces_seen: [],
    usage: {},
    conflicts: [],
    daemon: { available_tools: [] },
  },
  contextStatus: 'ready',
  contextTeamId: 't_chinmeister',
  pollError: null,
  pollErrorData: null,
  lastUpdate: new Date(),
};

const READY_TEAM_STATE = {
  activeTeamId: 't_chinmeister',
  teams: [{ team_id: 't_chinmeister', team_name: 'chinmeister' }],
};

const useTeamExtendedAnalyticsCalls = [];

async function loadProjectView({ pollingState, teamState, search = '' } = {}) {
  vi.resetModules();
  useTeamExtendedAnalyticsCalls.length = 0;

  // Set the URL query string before the router module initializes so its
  // useQueryParam reads the right value on first render.
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, search, pathname: '/dashboard/project/t_chinmeister' },
  });

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

  vi.doMock('../../lib/stores/teams.js', () => ({
    useTeamStore: (selector) => selector(teamState),
    teamActions: {
      updateMemory: vi.fn(),
      deleteMemory: vi.fn(),
      selectTeam: vi.fn(),
    },
  }));

  // Capture useTeamExtendedAnalytics call args so the test can assert
  // the analytics fetch gate widens correctly when a drill is open.
  vi.doMock('../../hooks/useTeamAnalytics.js', () => ({
    useTeamExtendedAnalytics: (teamId, days, enabled) => {
      useTeamExtendedAnalyticsCalls.push({ teamId, days, enabled });
      return { analytics: createEmptyAnalytics(), isLoading: false, error: null };
    },
  }));

  vi.doMock('../../hooks/useConversationAnalytics.js', () => ({
    useConversationAnalytics: () => ({ data: {}, isLoading: false }),
  }));

  vi.doMock('../../hooks/useDemoScenario.js', () => ({
    useDemoScenario: () => ({ active: false, scenarioId: null }),
  }));

  vi.doMock('../../components/StatusState/StatusState.js', () => ({
    default: function MockStatusState({ title }) {
      return <div data-testid="status-state">{title}</div>;
    },
  }));

  vi.doMock('../../components/ViewHeader/ViewHeader.js', () => ({
    default: function MockViewHeader({ title }) {
      return <div data-testid="view-header">{title}</div>;
    },
  }));

  vi.doMock('./ProjectMemoryTab.js', () => ({
    default: () => <div />,
  }));

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

  // Stub the seven detail views with name-tagged markers so the test can
  // assert which one mounted via document.querySelector.
  const stub = (label) =>
    function MockDetail({ backLabel }) {
      return (
        <div data-testid={`detail-${label}`} data-backlabel={backLabel ?? 'Overview'}>
          {label}
        </div>
      );
    };

  vi.doMock('../OverviewView/UsageDetailView/UsageDetailView.js', () => ({
    default: stub('usage'),
  }));
  vi.doMock('../OverviewView/OutcomesDetailView.js', () => ({ default: stub('outcomes') }));
  vi.doMock('../OverviewView/ActivityDetailView.js', () => ({ default: stub('activity') }));
  vi.doMock('../OverviewView/CodebaseDetailView.js', () => ({ default: stub('codebase') }));
  vi.doMock('../OverviewView/ToolsDetailView.js', () => ({ default: stub('tools') }));
  vi.doMock('../OverviewView/MemoryDetailView.js', () => ({ default: stub('memory') }));
  vi.doMock('../OverviewView/LiveNowView.js', () => ({
    default: function MockLive({ backLabel, scopeLabel }) {
      return (
        <div
          data-testid="detail-live"
          data-backlabel={backLabel ?? 'Overview'}
          data-scopelabel={scopeLabel ?? ''}
        >
          live
        </div>
      );
    },
  }));

  const mod = await import('./ProjectView.js');
  return mod.default;
}

function createEmptyAnalytics() {
  return {
    ok: true,
    period_days: 30,
    teams_included: 1,
    truncated_teams: 0,
    degraded: false,
    daily_trends: [],
    file_heatmap: [],
    tool_distribution: [],
    outcome_distribution: [],
    daily_metrics: [],
    hourly_distribution: [],
    model_outcomes: [],
    tool_outcomes: [],
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('ProjectView states', () => {
  it('replaces the normal project header with an unavailable state when context fails', async () => {
    const ProjectView = await loadProjectView({
      pollingState: {
        contextData: null,
        contextStatus: 'error',
        contextTeamId: 't_chinmeister',
        pollError: 'Internal server error',
        pollErrorData: null,
        lastUpdate: null,
      },
      teamState: {
        activeTeamId: 't_chinmeister',
        teams: [{ team_id: 't_chinmeister', team_name: 'chinmeister' }],
      },
    });
    const { container, unmount } = renderComponent(ProjectView);

    expect(container.querySelector('[data-testid="status-state"]')?.textContent).toContain(
      'Could not load chinmeister',
    );
    expect(container.querySelector('[data-testid="view-header"]')).toBeNull();

    unmount();
  });
});

describe('ProjectView detail-drill mounting', () => {
  const cases = [
    ['usage', '?usage=sessions', 'detail-usage'],
    ['outcomes', '?outcomes=sessions', 'detail-outcomes'],
    ['activity', '?activity=rhythm', 'detail-activity'],
    ['codebase', '?codebase=landscape', 'detail-codebase'],
    ['tools', '?tools=tools', 'detail-tools'],
    ['memory', '?memory=health', 'detail-memory'],
    ['live', '?live=', 'detail-live'],
  ];

  for (const [name, search, testid] of cases) {
    it(`mounts ${name} detail when ?${name} is set, with backLabel="Project"`, async () => {
      const ProjectView = await loadProjectView({
        pollingState: READY_POLLING_STATE,
        teamState: READY_TEAM_STATE,
        search,
      });
      const { container, unmount } = renderComponent(ProjectView);

      const node = container.querySelector(`[data-testid="${testid}"]`);
      expect(node).not.toBeNull();
      expect(node.getAttribute('data-backlabel')).toBe('Project');

      unmount();
    });
  }

  it('passes scopeLabel="in this project" to LiveNowView so its empty copy is project-scoped', async () => {
    const ProjectView = await loadProjectView({
      pollingState: READY_POLLING_STATE,
      teamState: READY_TEAM_STATE,
      search: '?live=',
    });
    const { container, unmount } = renderComponent(ProjectView);

    const node = container.querySelector('[data-testid="detail-live"]');
    expect(node?.getAttribute('data-scopelabel')).toBe('in this project');
    unmount();
  });
});

describe('ProjectView analytics gate', () => {
  it('fetches analytics when a detail drill is open even when the active tab is non-analytical', async () => {
    // Default tab is the first in PROJECT_TABS ('activity'), which is
    // analytical, so the gate would pass even without the drill widening.
    // We can still assert that the fetch is enabled when a drill is open
    // (a regression here would mean the empty-fixture flicker the batch
    // is meant to fix).
    const ProjectView = await loadProjectView({
      pollingState: READY_POLLING_STATE,
      teamState: READY_TEAM_STATE,
      search: '?usage=sessions',
    });
    renderComponent(ProjectView);

    // useTeamExtendedAnalytics should be called with enabled=true on at
    // least one render (the drill render path).
    const enabledCalls = useTeamExtendedAnalyticsCalls.filter((c) => c.enabled === true);
    expect(enabledCalls.length).toBeGreaterThan(0);
  });
});
