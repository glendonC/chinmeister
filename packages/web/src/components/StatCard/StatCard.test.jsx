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

async function loadStatCard() {
  vi.resetModules();
  const mod = await import('./StatCard.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('StatCard', () => {
  it('renders value and label', async () => {
    const StatCard = await loadStatCard();
    const { container, unmount } = renderComponent(StatCard, {
      value: 42,
      label: 'Sessions',
    });

    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('Sessions');

    unmount();
  });

  it('renders hint when provided', async () => {
    const StatCard = await loadStatCard();
    const { container, unmount } = renderComponent(StatCard, {
      value: 5,
      label: 'Tools',
      hint: 'configured',
    });

    expect(container.textContent).toContain('configured');

    unmount();
  });

  it('omits hint when not provided', async () => {
    const StatCard = await loadStatCard();
    const { container, unmount } = renderComponent(StatCard, {
      value: 5,
      label: 'Tools',
    });

    // Only label and value should be present
    expect(container.textContent).toBe('Tools5');

    unmount();
  });

  it('sets aria-label with value and label', async () => {
    const StatCard = await loadStatCard();
    const { container, unmount } = renderComponent(StatCard, {
      value: 3,
      label: 'Hosts',
    });

    const group = container.querySelector('[role="group"]');
    expect(group.getAttribute('aria-label')).toBe('3 Hosts');

    unmount();
  });
});
