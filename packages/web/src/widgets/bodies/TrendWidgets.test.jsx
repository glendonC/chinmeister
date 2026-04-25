// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadModule() {
  vi.resetModules();
  const [trendsMod, schemasMod] = await Promise.all([
    import('./TrendWidgets.js'),
    import('../../lib/schemas/analytics.js'),
  ]);
  return {
    OutcomeTrendWidget: trendsMod.trendWidgets['outcome-trend'],
    createEmptyUserAnalytics: schemasMod.createEmptyUserAnalytics,
  };
}

function makeProps(analytics) {
  return {
    analytics,
    conversationData: { sessions: [] },
    summaries: [],
    liveAgents: [],
    locks: [],
    selectTeam: () => {},
  };
}

function render(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Component {...props} />);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function zeroTrendRow(day) {
  return {
    day,
    sessions: 0,
    edits: 0,
    lines_added: 0,
    lines_removed: 0,
    avg_duration_min: 0,
    completed: 0,
    abandoned: 0,
    failed: 0,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('OutcomeTrendWidget resilience', () => {
  it('ignores zero-outcome days and renders a named empty state when no active days remain', async () => {
    // 2026-04-24: OutcomeTrendWidget switched from continuous stacked
    // area (SVG paths) to discrete stacked columns per day. Empty state
    // path is unchanged — SectionEmpty when <2 observed days.
    const { OutcomeTrendWidget, createEmptyUserAnalytics } = await loadModule();
    const analytics = createEmptyUserAnalytics();
    analytics.daily_trends = Array.from({ length: 11 }, (_, i) =>
      zeroTrendRow(`2026-04-${String(10 + i).padStart(2, '0')}`),
    );
    const r = render(OutcomeTrendWidget, makeProps(analytics));
    expect(r.container.textContent).toMatch(/2\+ different days/);
    r.unmount();
  });

  it('renders per-day groups and a legend when outcomes are recorded', async () => {
    // 2026-04-24: outcome-trend switched from HTML grid columns back
    // to SVG bars (flex/grid %-height kept collapsing). Each day
    // renders a <g> group with rects for the present outcomes plus
    // a hit rect for tooltip + hover tint.
    const { OutcomeTrendWidget, createEmptyUserAnalytics } = await loadModule();
    const analytics = createEmptyUserAnalytics();
    analytics.daily_trends = [
      zeroTrendRow('2026-04-14'),
      { ...zeroTrendRow('2026-04-15'), sessions: 4, completed: 3, abandoned: 1 },
      zeroTrendRow('2026-04-16'),
      { ...zeroTrendRow('2026-04-17'), sessions: 5, completed: 2, failed: 1 },
    ];
    const r = render(OutcomeTrendWidget, makeProps(analytics));
    const dayGroups = r.container.querySelectorAll('svg g');
    expect(dayGroups.length).toBe(analytics.daily_trends.length);
    expect(r.container.textContent).toMatch(/completed/);
    expect(r.container.textContent).toMatch(/abandoned/);
    expect(r.container.textContent).toMatch(/failed/);
    r.unmount();
  });
});
