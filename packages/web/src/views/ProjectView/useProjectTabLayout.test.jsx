// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectTabLayout } from './useProjectTabLayout.js';
import { ACTIVITY_DEFAULT_LAYOUT, TRENDS_DEFAULT_LAYOUT } from './projectTabDefaults.js';

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
  it('drops saved ids that are not in the current catalog', () => {
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
    expect(ids).toContain('outcomes');
    expect(ids).not.toContain('models');
    h.unmount();
  });

  it('seeds default layout from current ids only', () => {
    const h = renderHookOnce('activity', ACTIVITY_DEFAULT_LAYOUT);
    const ids = h.value.slots.map((s) => s.id);
    expect(ids).toEqual(ACTIVITY_DEFAULT_LAYOUT.map((s) => s.id));
    h.unmount();
  });
});
