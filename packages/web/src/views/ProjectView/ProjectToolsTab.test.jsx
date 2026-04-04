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

async function loadProjectToolsTab() {
  vi.resetModules();

  vi.doMock('../../components/ToolIcon/ToolIcon.js', () => ({
    default: function MockToolIcon({ tool }) {
      return <span data-testid="tool-icon">{tool}</span>;
    },
  }));

  vi.doMock('../../components/EmptyState/EmptyState.js', () => ({
    default: function MockEmptyState({ title, hint }) {
      return (
        <div data-testid="empty-state">
          {title}::{hint}
        </div>
      );
    },
  }));

  const mod = await import('./ProjectToolsTab.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const defaultProps = {
  toolSummaries: [],
  hostSummaries: [],
  surfaceSummaries: [],
  modelsSeen: [],
  conflicts: [],
  filesInPlay: [],
  locks: [],
  usageEntries: [],
};

describe('ProjectToolsTab', () => {
  it('shows empty state when no tools are configured', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, defaultProps);

    const emptyState = container.querySelector('[data-testid="empty-state"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState.textContent).toContain('No tools configured');

    unmount();
  });

  it('renders tool summaries with join and live counts', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [
        { tool: 'cursor', live: 2, joins: 10, share: 0.6 },
        { tool: 'windsurf', live: 1, joins: 5, share: 0.3 },
      ],
    });

    expect(container.textContent).toContain('Tools in this project');
    expect(container.textContent).toContain('2 live');
    expect(container.textContent).toContain('10 joins');
    expect(container.textContent).toContain('1 live');
    expect(container.textContent).toContain('5 joins');

    unmount();
  });

  it('renders host summaries', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 1, joins: 5, share: 1 }],
      hostSummaries: [{ host_tool: 'cursor', live: 1, joins: 5, share: 1 }],
    });

    expect(container.textContent).toContain('Hosts in this project');

    unmount();
  });

  it('shows empty hint when no hosts detected', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 1, joins: 5, share: 1 }],
      hostSummaries: [],
    });

    expect(container.textContent).toContain('No host telemetry yet');

    unmount();
  });

  it('renders surface summaries', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 1, joins: 5, share: 1 }],
      surfaceSummaries: [{ agent_surface: 'claude-code', live: 1, joins: 3, share: 0.5 }],
    });

    expect(container.textContent).toContain('Surfaces in this project');

    unmount();
  });

  it('shows empty hint when no surfaces observed', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 1, joins: 5, share: 1 }],
      surfaceSummaries: [],
    });

    expect(container.textContent).toContain('No extension-level surfaces observed yet');

    unmount();
  });

  it('renders models section when models are seen', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 1, joins: 5, share: 1 }],
      modelsSeen: [
        { agent_model: 'claude-sonnet-4', count: 5 },
        { agent_model: 'gpt-4o', count: 1 },
      ],
    });

    expect(container.textContent).toContain('Models');
    expect(container.textContent).toContain('claude-sonnet-4');
    expect(container.textContent).toContain('5 sessions');
    expect(container.textContent).toContain('gpt-4o');
    expect(container.textContent).toContain('1 session');

    unmount();
  });

  it('hides models section when none are seen', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 1, joins: 5, share: 1 }],
      modelsSeen: [],
    });

    expect(container.textContent).not.toContain('Models');

    unmount();
  });

  it('renders coordination stats', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 1, joins: 5, share: 1 }],
      conflicts: [{ file: 'a.ts', owners: ['x', 'y'] }],
      filesInPlay: ['a.ts', 'b.ts'],
      locks: [{ file_path: 'c.ts' }],
    });

    expect(container.textContent).toContain('Coordination');
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('overlapping files now');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('files in play now');
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('locks held now');

    unmount();
  });

  it('renders usage entries when present', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 1, joins: 5, share: 1 }],
      usageEntries: [
        { id: 'total_sessions', label: 'Total sessions', value: 42 },
        { id: 'total_edits', label: 'Total edits', value: 100 },
      ],
    });

    expect(container.textContent).toContain('Total sessions');
    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('Total edits');
    expect(container.textContent).toContain('100');

    unmount();
  });

  it('shows dash for tools with zero joins', async () => {
    const ProjectToolsTab = await loadProjectToolsTab();
    const { container, unmount } = renderComponent(ProjectToolsTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 0, joins: 0, share: 0 }],
    });

    // The \u2014 (em dash) should be rendered for zero-join tools
    expect(container.textContent).toContain('\u2014');

    unmount();
  });
});
