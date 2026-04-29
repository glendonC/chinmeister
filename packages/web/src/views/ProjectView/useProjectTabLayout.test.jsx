// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectTabLayout } from './useProjectTabLayout.js';
import { TRENDS_DEFAULT_LAYOUT } from './projectTabDefaults.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Tiny test-only host that captures the hook's return into a ref so the
// test can assert against it. Mirrors what `renderHook` does in the
// testing-library, kept inline so the suite avoids the extra dep.
function HookHost({ tabId, defaults, capture }) {
  const value = useProjectTabLayout(tabId, defaults);
  useEffect(() => {
    capture(value);
  });
  return null;
}

function renderHookOnce(tabId, defaults) {
  let captured = null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <HookHost
        tabId={tabId}
        defaults={defaults}
        capture={(v) => {
          captured = v;
        }}
      />,
    );
  });
  return {
    get value() {
      return captured;
    },
    rerender: () => {
      act(() => {
        root.render(
          <HookHost
            tabId={tabId}
            defaults={defaults}
            capture={(v) => {
              captured = v;
            }}
          />,
        );
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('useProjectTabLayout', () => {
  it('rewrites a saved layout containing the deprecated `models` id to `model-mix`', () => {
    const stored = {
      version: 3,
      widgets: [
        { id: 'outcomes', colSpan: 8, rowSpan: 3 },
        { id: 'models', colSpan: 6, rowSpan: 3 },
      ],
    };
    localStorage.setItem('chinmeister:project-trends-dashboard', JSON.stringify(stored));

    const h = renderHookOnce('trends', TRENDS_DEFAULT_LAYOUT);
    const ids = h.value.slots.map((s) => s.id);
    expect(ids).toContain('model-mix');
    expect(ids).not.toContain('models');
    h.unmount();
  });

  it('drops widgets aliased to an empty replacement set', () => {
    const stored = {
      version: 3,
      widgets: [
        { id: 'tools', colSpan: 6, rowSpan: 3 },
        { id: 'first-edit', colSpan: 6, rowSpan: 3 },
        { id: 'outcomes', colSpan: 8, rowSpan: 3 },
      ],
    };
    localStorage.setItem('chinmeister:project-trends-dashboard', JSON.stringify(stored));

    const h = renderHookOnce('trends', TRENDS_DEFAULT_LAYOUT);
    const ids = h.value.slots.map((s) => s.id);
    expect(ids).not.toContain('tools');
    expect(ids).not.toContain('first-edit');
    expect(ids).toContain('outcomes');
    h.unmount();
  });

  it('seeds default layout through alias resolution so deprecated ids in defaults heal', () => {
    // No stored layout: the hook seeds from `defaults`. TRENDS_DEFAULT_LAYOUT
    // intentionally still references some deprecated ids; alias resolution
    // should rewrite them on first paint rather than drop the slots.
    const h = renderHookOnce('trends', TRENDS_DEFAULT_LAYOUT);
    const ids = h.value.slots.map((s) => s.id);
    expect(ids).toContain('model-mix');
    expect(ids).not.toContain('models');
    expect(ids).not.toContain('first-edit');
    expect(ids).not.toContain('topics');
    expect(ids).not.toContain('prompt-clarity');
    expect(ids).not.toContain('tools');
    h.unmount();
  });
});
