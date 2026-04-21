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
    SessionTrendWidget: trendsMod.trendWidgets['session-trend'],
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

describe('SessionTrendWidget ghost fallback', () => {
  it('renders GhostSparkline when there is no data', async () => {
    const { SessionTrendWidget, createEmptyUserAnalytics } = await loadModule();
    const r = render(SessionTrendWidget, makeProps(createEmptyUserAnalytics()));
    // GhostSparkline draws a single <line>; the populated Sparkline draws paths.
    expect(r.container.querySelector('line')).not.toBeNull();
    expect(r.container.querySelector('path')).toBeNull();
    r.unmount();
  });

  it('renders a sparkline when any day has sessions', async () => {
    const { SessionTrendWidget, createEmptyUserAnalytics } = await loadModule();
    const analytics = createEmptyUserAnalytics();
    analytics.daily_trends = [
      zeroTrendRow('2026-04-14'),
      zeroTrendRow('2026-04-15'),
      { ...zeroTrendRow('2026-04-16'), sessions: 3 },
    ];
    const r = render(SessionTrendWidget, makeProps(analytics));
    expect(r.container.querySelector('path')).not.toBeNull();
    r.unmount();
  });
});

describe('OutcomeTrendWidget resilience', () => {
  it('ignores zero-session days and ghosts when no active days remain', async () => {
    const { OutcomeTrendWidget, createEmptyUserAnalytics } = await loadModule();
    const analytics = createEmptyUserAnalytics();
    analytics.daily_trends = Array.from({ length: 11 }, (_, i) =>
      zeroTrendRow(`2026-04-${String(10 + i).padStart(2, '0')}`),
    );
    const r = render(OutcomeTrendWidget, makeProps(analytics));
    expect(r.container.querySelector('line')).not.toBeNull();
    expect(r.container.querySelector('path')).toBeNull();
    r.unmount();
  });

  it('plots completion rate across active days when zero-padded rows are mixed in', async () => {
    const { OutcomeTrendWidget, createEmptyUserAnalytics } = await loadModule();
    const analytics = createEmptyUserAnalytics();
    analytics.daily_trends = [
      zeroTrendRow('2026-04-14'),
      { ...zeroTrendRow('2026-04-15'), sessions: 4, completed: 3 },
      zeroTrendRow('2026-04-16'),
      { ...zeroTrendRow('2026-04-17'), sessions: 5, completed: 2 },
    ];
    const r = render(OutcomeTrendWidget, makeProps(analytics));
    expect(r.container.querySelector('path')).not.toBeNull();
    r.unmount();
  });
});
