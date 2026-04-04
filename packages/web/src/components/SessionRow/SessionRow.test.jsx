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

async function loadSessionRow() {
  vi.resetModules();

  vi.doMock('../ToolIcon/ToolIcon.js', () => ({
    default: function MockToolIcon({ tool }) {
      return <span data-testid="tool-icon">{tool}</span>;
    },
  }));

  const mod = await import('./SessionRow.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SessionRow', () => {
  it('renders owner handle and duration', async () => {
    const SessionRow = await loadSessionRow();
    const { container, unmount } = renderComponent(SessionRow, {
      session: {
        owner_handle: 'alice',
        duration_minutes: 45,
        host_tool: 'cursor',
        framework: 'cursor',
      },
    });

    expect(container.textContent).toContain('alice');
    expect(container.textContent).toContain('45m');

    unmount();
  });

  it('shows "live" badge when session has no ended_at', async () => {
    const SessionRow = await loadSessionRow();
    const { container, unmount } = renderComponent(SessionRow, {
      session: {
        owner_handle: 'bob',
        duration_minutes: 10,
        host_tool: 'cursor',
      },
    });

    expect(container.textContent).toContain('live');

    unmount();
  });

  it('does not show "live" badge when session has ended_at', async () => {
    const SessionRow = await loadSessionRow();
    const { container, unmount } = renderComponent(SessionRow, {
      session: {
        owner_handle: 'bob',
        duration_minutes: 10,
        ended_at: '2026-01-01T01:00:00Z',
        host_tool: 'cursor',
      },
    });

    expect(container.textContent).not.toContain('live');

    unmount();
  });

  it('shows edit and file counts when present', async () => {
    const SessionRow = await loadSessionRow();
    const { container, unmount } = renderComponent(SessionRow, {
      session: {
        owner_handle: 'alice',
        duration_minutes: 30,
        edit_count: 15,
        files_touched: ['a.ts', 'b.ts', 'c.ts'],
        host_tool: 'cursor',
      },
    });

    expect(container.textContent).toContain('15 edits');
    expect(container.textContent).toContain('3 files');

    unmount();
  });

  it('falls back to handle when owner_handle is missing', async () => {
    const SessionRow = await loadSessionRow();
    const { container, unmount } = renderComponent(SessionRow, {
      session: {
        handle: 'fallback_user',
        duration_minutes: 5,
      },
    });

    expect(container.textContent).toContain('fallback_user');

    unmount();
  });

  it('falls back to "Agent" when neither handle is present', async () => {
    const SessionRow = await loadSessionRow();
    const { container, unmount } = renderComponent(SessionRow, {
      session: {
        duration_minutes: 5,
      },
    });

    expect(container.textContent).toContain('Agent');

    unmount();
  });

  it('renders tool icon when host_tool is not "unknown"', async () => {
    const SessionRow = await loadSessionRow();
    const { container, unmount } = renderComponent(SessionRow, {
      session: {
        owner_handle: 'alice',
        duration_minutes: 10,
        host_tool: 'cursor',
      },
    });

    expect(container.querySelector('[data-testid="tool-icon"]')).not.toBeNull();

    unmount();
  });

  it('does not render tool icon when host_tool is "unknown"', async () => {
    const SessionRow = await loadSessionRow();
    const { container, unmount } = renderComponent(SessionRow, {
      session: {
        owner_handle: 'alice',
        duration_minutes: 10,
        host_tool: 'unknown',
      },
    });

    expect(container.querySelector('[data-testid="tool-icon"]')).toBeNull();

    unmount();
  });
});
