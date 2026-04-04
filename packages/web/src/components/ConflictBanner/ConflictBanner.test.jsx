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
  return (await import('./ConflictBanner.js')).default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ConflictBanner', () => {
  it('renders conflict count and files (object format)', async () => {
    const ConflictBanner = await load();
    const { container, unmount } = renderComponent(ConflictBanner, {
      conflicts: [
        { file: 'src/app.ts', owners: ['alice', 'bob'] },
        { file: 'src/index.ts', owners: ['alice', 'carol'] },
      ],
    });
    expect(container.textContent).toContain('2 overlapping files');
    expect(container.textContent).toContain('src/app.ts');
    expect(container.textContent).toContain('alice & bob');
    expect(container.textContent).toContain('src/index.ts');
    unmount();
  });

  it('renders singular "file" for single conflict', async () => {
    const ConflictBanner = await load();
    const { container, unmount } = renderComponent(ConflictBanner, {
      conflicts: [{ file: 'a.ts', owners: ['x', 'y'] }],
    });
    expect(container.textContent).toContain('1 overlapping file');
    expect(container.textContent).not.toContain('files');
    unmount();
  });

  it('handles array tuple format', async () => {
    const ConflictBanner = await load();
    const { container, unmount } = renderComponent(ConflictBanner, {
      conflicts: [['src/main.ts', ['alice', 'bob']]],
    });
    expect(container.textContent).toContain('src/main.ts');
    expect(container.textContent).toContain('alice & bob');
    unmount();
  });

  it('handles agents key as fallback for owners', async () => {
    const ConflictBanner = await load();
    const { container, unmount } = renderComponent(ConflictBanner, {
      conflicts: [{ file: 'a.ts', agents: ['x', 'y'] }],
    });
    expect(container.textContent).toContain('x & y');
    unmount();
  });
});
