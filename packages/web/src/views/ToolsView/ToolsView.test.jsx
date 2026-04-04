// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderComponent(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Component {...props} />);
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

let mockToolsViewData;

async function loadToolsView(overrides = {}) {
  vi.resetModules();

  mockToolsViewData = {
    loading: false,
    evaluations: [],
    categories: {},
    toolShare: [],
    hostShare: [],
    surfaceShare: [],
    categoryShare: [],
    categoryList: [],
    connectedProjects: 0,
    filteredEvaluations: [],
    activeCategory: 'all',
    setActiveCategory: vi.fn(),
    activeVerdict: 'all',
    setActiveVerdict: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    expandedId: null,
    setExpandedId: vi.fn(),
    showAll: false,
    setShowAll: vi.fn(),
    ...overrides,
  };

  vi.doMock('./useToolsViewData.js', () => ({
    useToolsViewData: () => mockToolsViewData,
  }));

  vi.doMock('../../components/ViewHeader/ViewHeader.js', () => ({
    default: function MockViewHeader({ title }) {
      return <div data-testid="view-header">{title}</div>;
    },
  }));

  vi.doMock('../../components/StatCard/StatCard.js', () => ({
    default: function MockStatCard({ label, value, hint }) {
      return (
        <div data-testid="stat-card">
          {label}:{value}:{hint}
        </div>
      );
    },
  }));

  vi.doMock('../../components/ToolIcon/ToolIcon.js', () => ({
    default: function MockToolIcon() {
      return <span data-testid="tool-icon" />;
    },
  }));

  vi.doMock('./DirectoryRow.js', () => ({
    default: function MockDirectoryRow({ evaluation, isExpanded, onToggle }) {
      return (
        <div data-testid="directory-row" data-id={evaluation.id} data-expanded={String(isExpanded)}>
          <button data-testid={`toggle-${evaluation.id}`} onClick={onToggle}>
            {evaluation.name}
          </button>
        </div>
      );
    },
  }));

  const mod = await import('./ToolsView.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ToolsView', () => {
  it('shows loading state when loading with no evaluations', async () => {
    const ToolsView = await loadToolsView({ loading: true, evaluations: [] });
    const { container, unmount } = renderComponent(ToolsView, {});

    expect(container.textContent).toContain('Loading tool directory');

    unmount();
  });

  it('renders header and stat cards when data is loaded', async () => {
    const ToolsView = await loadToolsView({
      toolShare: [{ tool: 'claude', value: 5, projects: ['proj1'] }],
      hostShare: [{ host_tool: 'cursor', value: 3, share: 0.6, projects: ['proj1'] }],
      surfaceShare: [],
      connectedProjects: 2,
    });
    const { container, unmount } = renderComponent(ToolsView, {});

    expect(container.querySelector('[data-testid="view-header"]')?.textContent).toBe('Tools');

    const statCards = container.querySelectorAll('[data-testid="stat-card"]');
    expect(statCards.length).toBe(4);

    // Configured count
    expect(statCards[0].textContent).toContain('Configured');
    expect(statCards[0].textContent).toContain('1');

    // Projects count
    expect(statCards[3].textContent).toContain('Projects');
    expect(statCards[3].textContent).toContain('2');

    unmount();
  });

  it('shows empty hint when no tools are configured', async () => {
    const ToolsView = await loadToolsView({ toolShare: [] });
    const { container, unmount } = renderComponent(ToolsView, {});

    expect(container.textContent).toContain('npx chinwag init');

    unmount();
  });

  it('shows empty hint when no hosts are detected', async () => {
    const ToolsView = await loadToolsView({ hostShare: [] });
    const { container, unmount } = renderComponent(ToolsView, {});

    expect(container.textContent).toContain('No host telemetry yet');

    unmount();
  });

  it('shows empty hint when no surfaces are observed', async () => {
    const ToolsView = await loadToolsView({ surfaceShare: [] });
    const { container, unmount } = renderComponent(ToolsView, {});

    expect(container.textContent).toContain('No extension-level surfaces');

    unmount();
  });

  it('shows empty hint when no category data', async () => {
    const ToolsView = await loadToolsView({ categoryShare: [] });
    const { container, unmount } = renderComponent(ToolsView, {});

    expect(container.textContent).toContain('No category data yet');

    unmount();
  });

  it('renders directory rows for evaluations', async () => {
    const ToolsView = await loadToolsView({
      evaluations: [{ id: 'cursor' }, { id: 'claude' }],
      filteredEvaluations: [
        { id: 'cursor', name: 'Cursor' },
        { id: 'claude', name: 'Claude Code' },
      ],
    });
    const { container, unmount } = renderComponent(ToolsView, {});

    const rows = container.querySelectorAll('[data-testid="directory-row"]');
    expect(rows.length).toBe(2);
    expect(container.textContent).toContain('2 of 2 evaluated');

    unmount();
  });

  it('shows "No tools match" when filteredEvaluations is empty', async () => {
    const ToolsView = await loadToolsView({
      evaluations: [{ id: 'x' }],
      filteredEvaluations: [],
    });
    const { container, unmount } = renderComponent(ToolsView, {});

    expect(container.textContent).toContain('No tools match the current filters');

    unmount();
  });

  it('shows "Show more" button when more than 15 evaluations exist', async () => {
    const evals = Array.from({ length: 20 }, (_, i) => ({
      id: `tool_${i}`,
      name: `Tool ${i}`,
    }));
    const ToolsView = await loadToolsView({
      evaluations: evals,
      filteredEvaluations: evals,
      showAll: false,
    });
    const { container, unmount } = renderComponent(ToolsView, {});

    // Should only show 15 rows
    const rows = container.querySelectorAll('[data-testid="directory-row"]');
    expect(rows.length).toBe(15);

    const showMoreBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent.includes('more tools'),
    );
    expect(showMoreBtn).not.toBeUndefined();
    expect(showMoreBtn.textContent).toContain('5 more tools');

    unmount();
  });

  it('shows "Show less" button when showAll is true with many evaluations', async () => {
    const evals = Array.from({ length: 20 }, (_, i) => ({
      id: `tool_${i}`,
      name: `Tool ${i}`,
    }));
    const ToolsView = await loadToolsView({
      evaluations: evals,
      filteredEvaluations: evals,
      showAll: true,
    });
    const { container, unmount } = renderComponent(ToolsView, {});

    const rows = container.querySelectorAll('[data-testid="directory-row"]');
    expect(rows.length).toBe(20);

    const showLessBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Show less'),
    );
    expect(showLessBtn).not.toBeUndefined();

    unmount();
  });

  it('renders verdict filter buttons', async () => {
    const ToolsView = await loadToolsView();
    const { container, unmount } = renderComponent(ToolsView, {});

    expect(container.textContent).toContain('All');
    expect(container.textContent).toContain('Integrated');
    expect(container.textContent).toContain('Installable');
    expect(container.textContent).toContain('Listed');

    unmount();
  });

  it('renders search input', async () => {
    const ToolsView = await loadToolsView();
    const { container, unmount } = renderComponent(ToolsView, {});

    const searchInput = container.querySelector('input[placeholder="Search tools..."]');
    expect(searchInput).not.toBeNull();

    unmount();
  });

  it('calls setSearchQuery on search input change', async () => {
    const setSearchQuery = vi.fn();
    const ToolsView = await loadToolsView({ setSearchQuery });
    const { container, unmount } = renderComponent(ToolsView, {});

    const searchInput = container.querySelector('input[placeholder="Search tools..."]');

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    await act(async () => {
      nativeInputValueSetter.call(searchInput, 'cursor');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(setSearchQuery).toHaveBeenCalledWith('cursor');

    unmount();
  });
});
