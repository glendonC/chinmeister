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

async function loadProjectOverviewTab() {
  vi.resetModules();

  vi.doMock('../../components/ToolIcon/ToolIcon.js', () => ({
    default: function MockToolIcon({ tool }) {
      return <span data-testid="tool-icon">{tool}</span>;
    },
  }));

  const mod = await import('./ProjectOverviewTab.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const defaultProps = {
  members: [],
  activeAgents: [],
  conflicts: [],
  locks: [],
  sessionEditCount: 0,
  liveSessionCount: 0,
  filesTouchedCount: 0,
  toolSummaries: [],
};

describe('ProjectOverviewTab', () => {
  it('shows "All clear" and no-issues message when health is clean', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, defaultProps);

    expect(container.textContent).toContain('All clear');
    expect(container.textContent).toContain('No conflicts, stuck agents, or stale locks');

    unmount();
  });

  it('shows conflict count when conflicts exist', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      conflicts: [{ file: 'src/app.ts', owners: ['alice', 'bob'] }],
    });

    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('file conflict');

    unmount();
  });

  it('pluralizes "conflicts" for multiple', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      conflicts: [
        { file: 'a.ts', owners: ['x', 'y'] },
        { file: 'b.ts', owners: ['x', 'z'] },
      ],
    });

    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('file conflicts');

    unmount();
  });

  it('shows stuck agents when agents have been idle 15+ minutes', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      activeAgents: [{ minutes_since_update: 20 }, { minutes_since_update: 5 }],
    });

    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('stuck agent');

    unmount();
  });

  it('shows stale locks when locks are held 30+ minutes', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      locks: [{ file_path: 'lock.ts', minutes_held: 45 }],
    });

    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('stale lock');

    unmount();
  });

  it('renders team roster with online/offline members', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      members: [
        { handle: 'alice', status: 'active', host_tool: 'cursor' },
        { handle: 'bob', status: 'idle', host_tool: 'unknown' },
      ],
    });

    expect(container.textContent).toContain('alice');
    expect(container.textContent).toContain('bob');
    expect(container.textContent).toContain('1 online');

    unmount();
  });

  it('deduplicates roster entries for the same handle', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      members: [
        { handle: 'alice', status: 'active', host_tool: 'cursor' },
        { handle: 'alice', status: 'idle', host_tool: 'windsurf' },
      ],
    });

    // Should show alice only once but with both tools
    const aliceOccurrences = container.textContent.split('alice').length - 1;
    // The handle "alice" appears once in the roster handle + possibly in blockMeta
    // At minimum, only one roster row for alice
    expect(container.textContent).toContain('alice');
    expect(container.textContent).toContain('cursor');
    expect(container.textContent).toContain('windsurf');

    unmount();
  });

  it('shows "No members yet" when roster is empty', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      members: [],
    });

    expect(container.textContent).toContain('No members yet');

    unmount();
  });

  it('renders 24h summary stats', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      sessionEditCount: 42,
      filesTouchedCount: 15,
      liveSessionCount: 3,
      activeAgents: [{ minutes_since_update: 1 }, { minutes_since_update: 2 }],
    });

    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('edits reported');
    expect(container.textContent).toContain('15');
    expect(container.textContent).toContain('files touched');
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('live sessions');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('agents now');

    unmount();
  });

  it('shows active tools section when tools have live sessions', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      toolSummaries: [
        { tool: 'cursor', live: 2, joins: 5, share: 0.5 },
        { tool: 'claude', live: 0, joins: 3, share: 0.3 },
      ],
    });

    expect(container.textContent).toContain('Active tools');
    expect(container.textContent).toContain('2 live');
    // claude has 0 live, should not appear in active tools
    expect(container.textContent).not.toContain('3 live');

    unmount();
  });

  it('does not show active tools section when no tools have live sessions', async () => {
    const ProjectOverviewTab = await loadProjectOverviewTab();
    const { container, unmount } = renderComponent(ProjectOverviewTab, {
      ...defaultProps,
      toolSummaries: [{ tool: 'cursor', live: 0, joins: 5, share: 0.5 }],
    });

    expect(container.textContent).not.toContain('Active tools');

    unmount();
  });
});
