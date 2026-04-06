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

async function loadProjectSessionsTab() {
  vi.resetModules();

  vi.doMock('../../components/SessionRow/SessionRow.js', () => ({
    default: function MockSessionRow({ session }) {
      return (
        <div data-testid="session-row">{session.owner_handle || session.handle || 'agent'}</div>
      );
    },
  }));

  vi.doMock('../../components/EmptyState/EmptyState.js', () => ({
    default: function MockEmptyState({ title, hint }) {
      return (
        <div data-testid="empty-state">
          {title}::{hint}
        </div>
      );
    },
  }));

  const mod = await import('./ProjectSessionsTab.js');
  return mod.default;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ProjectSessionsTab', () => {
  it('shows empty state when no sessions exist', async () => {
    const ProjectSessionsTab = await loadProjectSessionsTab();
    const { container, unmount } = renderComponent(ProjectSessionsTab, {
      sessions: [],
      sessionEditCount: 0,
      filesTouched: [],
      filesTouchedCount: 0,
      liveSessionCount: 0,
      outcomeBreakdown: { completed: 0, abandoned: 0, failed: 0, unknown: 0, total: 0 },
      lineStats: { added: 0, removed: 0 },
      analytics: {
        ok: true,
        period_days: 7,
        file_heatmap: [],
        daily_trends: [],
        tool_distribution: [],
        outcome_distribution: [],
        daily_metrics: [],
      },
      analyticsLoading: false,
    });

    const emptyState = container.querySelector('[data-testid="empty-state"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState.textContent).toContain('No recent sessions');

    unmount();
  });

  it('renders session rows for each session', async () => {
    const ProjectSessionsTab = await loadProjectSessionsTab();
    const { container, unmount } = renderComponent(ProjectSessionsTab, {
      sessions: [
        { id: 's1', owner_handle: 'alice', started_at: '2026-01-01T00:00:00Z' },
        { id: 's2', handle: 'bob', started_at: '2026-01-01T01:00:00Z' },
      ],
      sessionEditCount: 10,
      filesTouched: ['src/app.ts'],
      filesTouchedCount: 1,
      liveSessionCount: 1,
      outcomeBreakdown: { completed: 0, abandoned: 0, failed: 0, unknown: 0, total: 0 },
      lineStats: { added: 0, removed: 0 },
      analytics: {
        ok: true,
        period_days: 7,
        file_heatmap: [],
        daily_trends: [],
        tool_distribution: [],
        outcome_distribution: [],
        daily_metrics: [],
      },
      analyticsLoading: false,
    });

    const rows = container.querySelectorAll('[data-testid="session-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toBe('alice');
    expect(rows[1].textContent).toBe('bob');

    unmount();
  });

  it('renders 24h summary stats', async () => {
    const ProjectSessionsTab = await loadProjectSessionsTab();
    const { container, unmount } = renderComponent(ProjectSessionsTab, {
      sessions: [{ id: 's1', owner_handle: 'alice' }],
      sessionEditCount: 25,
      filesTouched: ['a.ts', 'b.ts'],
      filesTouchedCount: 2,
      liveSessionCount: 3,
      outcomeBreakdown: { completed: 0, abandoned: 0, failed: 0, unknown: 0, total: 0 },
      lineStats: { added: 0, removed: 0 },
      analytics: {
        ok: true,
        period_days: 7,
        file_heatmap: [],
        daily_trends: [],
        tool_distribution: [],
        outcome_distribution: [],
        daily_metrics: [],
      },
      analyticsLoading: false,
    });

    expect(container.textContent).toContain('25');
    expect(container.textContent).toContain('edits reported');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('files touched');
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('sessions still live');

    unmount();
  });

  it('shows files touched list when files exist', async () => {
    const ProjectSessionsTab = await loadProjectSessionsTab();
    const { container, unmount } = renderComponent(ProjectSessionsTab, {
      sessions: [{ id: 's1', owner_handle: 'alice' }],
      sessionEditCount: 5,
      filesTouched: ['src/index.ts', 'src/utils.ts', 'package.json'],
      filesTouchedCount: 3,
      liveSessionCount: 0,
      outcomeBreakdown: { completed: 0, abandoned: 0, failed: 0, unknown: 0, total: 0 },
      lineStats: { added: 0, removed: 0 },
      analytics: {
        ok: true,
        period_days: 7,
        file_heatmap: [],
        daily_trends: [],
        tool_distribution: [],
        outcome_distribution: [],
        daily_metrics: [],
      },
      analyticsLoading: false,
    });

    expect(container.textContent).toContain('Files touched');
    expect(container.textContent).toContain('src/index.ts');
    expect(container.textContent).toContain('src/utils.ts');
    expect(container.textContent).toContain('package.json');

    unmount();
  });

  it('hides files section when no files touched', async () => {
    const ProjectSessionsTab = await loadProjectSessionsTab();
    const { container, unmount } = renderComponent(ProjectSessionsTab, {
      sessions: [{ id: 's1', owner_handle: 'alice' }],
      sessionEditCount: 0,
      filesTouched: [],
      filesTouchedCount: 0,
      liveSessionCount: 0,
      outcomeBreakdown: { completed: 0, abandoned: 0, failed: 0, unknown: 0, total: 0 },
      lineStats: { added: 0, removed: 0 },
      analytics: {
        ok: true,
        period_days: 7,
        file_heatmap: [],
        daily_trends: [],
        tool_distribution: [],
        outcome_distribution: [],
        daily_metrics: [],
      },
      analyticsLoading: false,
    });

    expect(container.textContent).not.toContain('Files touched');

    unmount();
  });
});
