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

async function loadMemoriesPanel() {
  vi.resetModules();

  vi.doMock('../../lib/projectGradient.js', () => ({
    projectGradient: (id) => `gradient-${id}`,
  }));

  const mod = await import('./MemoriesPanel.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('MemoriesPanel', () => {
  it('shows empty message when totalMemories is 0', async () => {
    const MemoriesPanel = await loadMemoriesPanel();
    const { container, unmount } = renderComponent(MemoriesPanel, {
      summaries: [],
      totalMemories: 0,
      selectTeam: vi.fn(),
    });

    expect(container.textContent).toContain('No memories saved yet');

    unmount();
  });

  it('renders memory rows sorted by count with share percentage', async () => {
    const MemoriesPanel = await loadMemoriesPanel();
    const { container, unmount } = renderComponent(MemoriesPanel, {
      summaries: [
        { team_id: 't_1', team_name: 'Alpha', memory_count: 3 },
        { team_id: 't_2', team_name: 'Beta', memory_count: 7 },
      ],
      totalMemories: 10,
      selectTeam: vi.fn(),
    });

    expect(container.textContent).toContain('Project');
    expect(container.textContent).toContain('Count');
    expect(container.textContent).toContain('Share');
    expect(container.textContent).toContain('Beta');
    expect(container.textContent).toContain('7');
    expect(container.textContent).toContain('70%');
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('30%');

    unmount();
  });

  it('calls selectTeam when a row is clicked', async () => {
    const selectTeam = vi.fn();
    const MemoriesPanel = await loadMemoriesPanel();
    const { container, unmount } = renderComponent(MemoriesPanel, {
      summaries: [{ team_id: 't_1', team_name: 'Alpha', memory_count: 5 }],
      totalMemories: 5,
      selectTeam,
    });

    const btn = container.querySelector('button');
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectTeam).toHaveBeenCalledWith('t_1');

    unmount();
  });

  it('filters out teams with zero memories', async () => {
    const MemoriesPanel = await loadMemoriesPanel();
    const { container, unmount } = renderComponent(MemoriesPanel, {
      summaries: [
        { team_id: 't_1', team_name: 'Alpha', memory_count: 5 },
        { team_id: 't_2', team_name: 'Beta', memory_count: 0 },
      ],
      totalMemories: 5,
      selectTeam: vi.fn(),
    });

    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).not.toContain('Beta');

    unmount();
  });
});
