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
  return (await import('./LockRow.js')).default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('LockRow', () => {
  it('renders file path and owner handle', async () => {
    const LockRow = await load();
    const { container, unmount } = renderComponent(LockRow, {
      lock: { file_path: 'src/app.ts', handle: 'alice', host_tool: 'cursor', minutes_held: 10 },
    });
    expect(container.textContent).toContain('src/app.ts');
    expect(container.textContent).toContain('alice');
    expect(container.textContent).toContain('10m');
    unmount();
  });

  it('hides tool icon when host_tool is "unknown"', async () => {
    const LockRow = await load();
    const { container, unmount } = renderComponent(LockRow, {
      lock: { file_path: 'a.ts', handle: 'bob', host_tool: 'unknown' },
    });
    expect(container.querySelector('[data-testid="tool-icon"]')).toBeNull();
    unmount();
  });

  it('shows tool icon when host_tool is valid', async () => {
    const LockRow = await load();
    const { container, unmount } = renderComponent(LockRow, {
      lock: { file_path: 'a.ts', handle: 'bob', host_tool: 'cursor' },
    });
    expect(container.querySelector('[data-testid="tool-icon"]')).not.toBeNull();
    unmount();
  });
});
