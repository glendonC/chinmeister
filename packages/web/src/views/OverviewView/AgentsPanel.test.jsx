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

async function loadAgentsPanel() {
  vi.resetModules();

  vi.doMock('../../components/ToolIcon/ToolIcon.js', () => ({
    default: function MockToolIcon({ tool }) {
      return <span data-testid="tool-icon">{tool}</span>;
    },
  }));

  const mod = await import('./AgentsPanel.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('AgentsPanel', () => {
  it('shows empty message when no agent rows exist', async () => {
    const AgentsPanel = await loadAgentsPanel();
    const { container, unmount } = renderComponent(AgentsPanel, { agentRows: [] });

    expect(container.textContent).toContain('No agent activity recorded yet');

    unmount();
  });

  it('renders agent rows with tool, project, and joins', async () => {
    const AgentsPanel = await loadAgentsPanel();
    const { container, unmount } = renderComponent(AgentsPanel, {
      agentRows: [
        { tool: 'cursor', teamName: 'Project Alpha', teamId: 't_1', joins: 5 },
        { tool: 'windsurf', teamName: 'Project Beta', teamId: 't_2', joins: 3 },
      ],
    });

    expect(container.textContent).toContain('Tool');
    expect(container.textContent).toContain('Project');
    expect(container.textContent).toContain('Sessions');
    expect(container.textContent).toContain('Project Alpha');
    expect(container.textContent).toContain('5');
    expect(container.textContent).toContain('Project Beta');
    expect(container.textContent).toContain('3');

    unmount();
  });
});
