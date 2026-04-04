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

async function load() {
  vi.resetModules();
  vi.doMock('../ToolIcon/ToolIcon.js', () => ({
    default: function MockToolIcon({ tool }) {
      return <span data-testid="tool-icon">{tool}</span>;
    },
  }));
  return (await import('./AgentRow.js')).default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('AgentRow', () => {
  it('renders handle and tool for an active agent', async () => {
    const AgentRow = await load();
    const { container, unmount } = renderComponent(AgentRow, {
      agent: {
        agent_id: 'a1',
        handle: 'alice',
        status: 'active',
        host_tool: 'cursor',
        activity: { files: ['src/app.ts', 'src/index.ts', 'src/utils.ts'] },
        session_minutes: 30,
      },
    });
    expect(container.textContent).toContain('alice');
    expect(container.textContent).toContain('cursor');
    expect(container.textContent).toContain('app.ts');
    expect(container.textContent).toContain('+1');
    expect(container.textContent).toContain('30m');
    unmount();
  });

  it('renders without tool icon when host_tool is "unknown"', async () => {
    const AgentRow = await load();
    const { container, unmount } = renderComponent(AgentRow, {
      agent: { agent_id: 'a2', handle: 'bob', status: 'idle', host_tool: 'unknown' },
    });
    expect(container.textContent).toContain('bob');
    expect(container.querySelector('[data-testid="tool-icon"]')).toBeNull();
    unmount();
  });

  it('shows summary when no files and summary is meaningful', async () => {
    const AgentRow = await load();
    const { container, unmount } = renderComponent(AgentRow, {
      agent: {
        agent_id: 'a3',
        handle: 'carol',
        status: 'active',
        host_tool: 'cursor',
        activity: { summary: 'Refactoring auth module' },
      },
    });
    expect(container.textContent).toContain('Refactoring auth module');
    unmount();
  });

  it('filters out "editing ..." summaries', async () => {
    const AgentRow = await load();
    const { container, unmount } = renderComponent(AgentRow, {
      agent: {
        agent_id: 'a4',
        handle: 'dave',
        status: 'active',
        host_tool: 'cursor',
        activity: { summary: 'editing files' },
      },
    });
    expect(container.textContent).not.toContain('editing files');
    unmount();
  });
});
