// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderComponent(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    root,
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
  return (await import('./RenderErrorBoundary.js')).default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function BrokenChild() {
  throw new Error('Test render error');
}

describe('RenderErrorBoundary', () => {
  it('renders children when no error', async () => {
    const RenderErrorBoundary = await load();
    const { container, unmount } = renderComponent(
      <RenderErrorBoundary>
        <div>Hello</div>
      </RenderErrorBoundary>,
    );
    expect(container.textContent).toContain('Hello');
    unmount();
  });

  it('shows fallback UI when child throws', async () => {
    const RenderErrorBoundary = await load();
    // Suppress React error logging during error boundary test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, unmount } = renderComponent(
      <RenderErrorBoundary>
        <BrokenChild />
      </RenderErrorBoundary>,
    );
    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('Try again');
    spy.mockRestore();
    unmount();
  });

  it('recovers on "Try again" click', async () => {
    const RenderErrorBoundary = await load();
    let shouldThrow = true;
    function MaybeBroken() {
      if (shouldThrow) throw new Error('Test');
      return <div>Recovered</div>;
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, unmount } = renderComponent(
      <RenderErrorBoundary>
        <MaybeBroken />
      </RenderErrorBoundary>,
    );

    expect(container.textContent).toContain('Something went wrong');

    shouldThrow = false;
    const btn = container.querySelector('button');
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Recovered');
    spy.mockRestore();
    unmount();
  });

  it('uses custom fallback when provided', async () => {
    const RenderErrorBoundary = await load();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, unmount } = renderComponent(
      <RenderErrorBoundary
        fallback={({ reset }) => <button onClick={reset}>Custom fallback</button>}
      >
        <BrokenChild />
      </RenderErrorBoundary>,
    );
    expect(container.textContent).toContain('Custom fallback');
    spy.mockRestore();
    unmount();
  });
});
