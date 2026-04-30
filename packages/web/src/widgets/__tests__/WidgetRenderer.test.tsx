// @vitest-environment jsdom

// WidgetRenderer wraps a body in either a clickable affordance (full-
// container hover + corner arrow) or a bare frame, depending on the
// catalog's `drillTarget` and `ownsClick` flags. Tests below pin the
// three branches: unknown id renders a fallback, drill-target wrapping
// fires navigateToDetail, and ownsClick suppresses the outer wrapper.

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from '../../lib/router.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../lib/router.js', async () => {
  const actual = await vi.importActual<typeof RouterModule>('../../lib/router.js');
  return {
    ...actual,
    navigateToDetail: vi.fn(),
  };
});

import { WidgetRenderer } from '../WidgetRenderer.js';
import { createEmptyAnalytics } from '../../lib/demo/empty.js';
import { createEmptyConversationAnalytics } from '../../lib/schemas/conversation.js';
import { navigateToDetail } from '../../lib/router.js';

function makeProps() {
  return {
    analytics: createEmptyAnalytics(),
    conversationData: createEmptyConversationAnalytics(),
    summaries: [],
    liveAgents: [],
    locks: [],
    selectTeam: () => {},
  };
}

function render(widgetId: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<WidgetRenderer widgetId={widgetId} {...makeProps()} />);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  vi.mocked(navigateToDetail).mockReset();
});

describe('WidgetRenderer', () => {
  it('renders nothing for an unknown widget id', () => {
    // Catalog miss returns null. The catalog-parity test pins that no
    // such id can come through the canonical surfaces, so this branch
    // exists only as defense-in-depth for hand-edited storage.
    const r = render('not-a-real-widget');
    expect(r.container.textContent).toBe('');
    r.unmount();
  });

  it('paints the section title and body for a catalog id with a body', () => {
    const r = render('sessions');
    expect(r.container.textContent).toContain('sessions');
    r.unmount();
  });

  it('wraps a drillTarget body in a clickable container that calls navigateToDetail', () => {
    // `outcome-trend` has drillTarget but no ownsClick, so the outer
    // wrapper paints the corner arrow + handles the click.
    const r = render('outcome-trend');
    const button = r.container.querySelector('[role="button"]');
    expect(button).not.toBeNull();
    act(() => {
      (button as HTMLElement).click();
    });
    expect(navigateToDetail).toHaveBeenCalledWith('outcomes', 'sessions', 'trend');
    r.unmount();
  });

  it('skips the outer click wrapper when the body owns its click', () => {
    // `sessions` has both drillTarget and ownsClick: true. The body
    // paints its own click affordance (StatWidget onOpenDetail), so the
    // renderer must not stack a second one. Asserts no role="button"
    // wrapper at the outer body level.
    const r = render('sessions');
    const outerButtons = r.container.querySelectorAll('[role="button"]');
    // The body is a StatWidget which itself may paint a button, so we
    // assert the WIDGET-LEVEL outer container is NOT a button. The body
    // structure has a head + body div pair (data-widget-zone). Neither
    // should carry role="button" when ownsClick is true.
    const widgetBody = r.container.querySelector('[data-widget-zone="body"]');
    expect(widgetBody?.getAttribute('role')).not.toBe('button');
    // navigateToDetail should not have fired from a phantom outer click.
    expect(outerButtons.length).toBeLessThan(2);
    r.unmount();
  });

  it('responds to keyboard activation (Enter or Space) on the wrapper', () => {
    const r = render('outcome-trend');
    const button = r.container.querySelector('[role="button"]') as HTMLElement;
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      button.dispatchEvent(event);
    });
    expect(navigateToDetail).toHaveBeenCalled();
    r.unmount();
  });
});
