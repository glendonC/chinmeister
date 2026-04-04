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

async function loadProjectsPanel() {
  vi.resetModules();

  vi.doMock('../../lib/projectGradient.js', () => ({
    projectGradient: (id) => `gradient-${id}`,
  }));

  const mod = await import('./ProjectsPanel.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ProjectsPanel', () => {
  it('renders project rows with name, live agents, memories, and tool count', async () => {
    const ProjectsPanel = await loadProjectsPanel();
    const projects = [
      {
        team_id: 't_1',
        team_name: 'Alpha',
        active_agents: 2,
        memory_count: 10,
        hosts_configured: [{ host_tool: 'cursor', joins: 5 }],
      },
    ];
    const { container, unmount } = renderComponent(ProjectsPanel, {
      summaries: projects,
      filteredProjects: projects,
      search: '',
      setSearch: vi.fn(),
      selectTeam: vi.fn(),
    });

    expect(container.textContent).toContain('Name');
    expect(container.textContent).toContain('Live');
    expect(container.textContent).toContain('Memories');
    expect(container.textContent).toContain('Tools');
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('10');

    unmount();
  });

  it('calls selectTeam when a project row is clicked', async () => {
    const selectTeam = vi.fn();
    const ProjectsPanel = await loadProjectsPanel();
    const projects = [{ team_id: 't_1', team_name: 'Alpha' }];
    const { container, unmount } = renderComponent(ProjectsPanel, {
      summaries: projects,
      filteredProjects: projects,
      search: '',
      setSearch: vi.fn(),
      selectTeam,
    });

    const btn = container.querySelector('button');
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectTeam).toHaveBeenCalledWith('t_1');

    unmount();
  });

  it('shows search input when more than 3 summaries exist', async () => {
    const ProjectsPanel = await loadProjectsPanel();
    const projects = Array.from({ length: 4 }, (_, i) => ({
      team_id: `t_${i}`,
      team_name: `Project ${i}`,
    }));
    const { container, unmount } = renderComponent(ProjectsPanel, {
      summaries: projects,
      filteredProjects: projects,
      search: '',
      setSearch: vi.fn(),
      selectTeam: vi.fn(),
    });

    const searchInput = container.querySelector('input[placeholder="Search projects"]');
    expect(searchInput).not.toBeNull();

    unmount();
  });

  it('hides search input when 3 or fewer summaries exist', async () => {
    const ProjectsPanel = await loadProjectsPanel();
    const projects = [
      { team_id: 't_1', team_name: 'Alpha' },
      { team_id: 't_2', team_name: 'Beta' },
    ];
    const { container, unmount } = renderComponent(ProjectsPanel, {
      summaries: projects,
      filteredProjects: projects,
      search: '',
      setSearch: vi.fn(),
      selectTeam: vi.fn(),
    });

    const searchInput = container.querySelector('input[placeholder="Search projects"]');
    expect(searchInput).toBeNull();

    unmount();
  });

  it('uses team_id as fallback when team_name is missing', async () => {
    const ProjectsPanel = await loadProjectsPanel();
    const projects = [{ team_id: 't_no_name' }];
    const { container, unmount } = renderComponent(ProjectsPanel, {
      summaries: projects,
      filteredProjects: projects,
      search: '',
      setSearch: vi.fn(),
      selectTeam: vi.fn(),
    });

    expect(container.textContent).toContain('t_no_name');

    unmount();
  });
});
