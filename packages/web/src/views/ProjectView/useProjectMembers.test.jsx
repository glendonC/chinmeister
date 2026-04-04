// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useProjectMembers from './useProjectMembers.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockContextData = null;

vi.mock('../../lib/stores/polling.js', () => ({
  usePollingStore: (selector) => selector({ contextData: mockContextData }),
}));

vi.mock('../../lib/toolAnalytics.js', () => ({
  buildLiveToolMix: vi.fn((members) => {
    // Minimal stub: count active members by tool
    const counts = {};
    (members || []).forEach((m) => {
      if (m.status === 'active') {
        const tool = m.host_tool || 'unknown';
        counts[tool] = (counts[tool] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([tool, value]) => ({
      tool,
      label: tool,
      value,
      share: 1,
    }));
  }),
}));

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
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

// Test harness that renders hook results as JSON
function HookOutput() {
  const result = useProjectMembers();

  return <pre data-testid="output">{JSON.stringify(result)}</pre>;
}

function getOutput(container) {
  return JSON.parse(container.querySelector('[data-testid="output"]').textContent);
}

afterEach(() => {
  mockContextData = null;
  document.body.innerHTML = '';
});

describe('useProjectMembers', () => {
  it('returns empty arrays when contextData is null', () => {
    mockContextData = null;
    const { container, unmount } = render(<HookOutput />);
    const result = getOutput(container);

    expect(result.members).toEqual([]);
    expect(result.activeAgents).toEqual([]);
    expect(result.offlineAgents).toEqual([]);
    expect(result.sortedAgents).toEqual([]);
    expect(result.liveToolMix).toEqual([]);

    unmount();
  });

  it('returns empty arrays when contextData has no members', () => {
    mockContextData = { members: [] };
    const { container, unmount } = render(<HookOutput />);
    const result = getOutput(container);

    expect(result.members).toEqual([]);
    expect(result.activeAgents).toEqual([]);
    expect(result.offlineAgents).toEqual([]);

    unmount();
  });

  it('partitions members into active and offline', () => {
    mockContextData = {
      members: [
        { agent_id: 'a1', handle: 'alice', status: 'active', host_tool: 'cursor' },
        { agent_id: 'a2', handle: 'bob', status: 'offline', host_tool: 'claude' },
        { agent_id: 'a3', handle: 'carol', status: 'active', host_tool: 'vscode' },
      ],
    };
    const { container, unmount } = render(<HookOutput />);
    const result = getOutput(container);

    expect(result.members).toHaveLength(3);
    expect(result.activeAgents).toHaveLength(2);
    expect(result.activeAgents.map((m) => m.handle)).toEqual(['alice', 'carol']);
    expect(result.offlineAgents).toHaveLength(1);
    expect(result.offlineAgents[0].handle).toBe('bob');

    unmount();
  });

  it('sorts agents with active first, then offline', () => {
    mockContextData = {
      members: [
        { agent_id: 'a1', handle: 'alice', status: 'offline', host_tool: 'cursor' },
        { agent_id: 'a2', handle: 'bob', status: 'active', host_tool: 'claude' },
        { agent_id: 'a3', handle: 'carol', status: 'offline', host_tool: 'vscode' },
        { agent_id: 'a4', handle: 'dave', status: 'active', host_tool: 'cursor' },
      ],
    };
    const { container, unmount } = render(<HookOutput />);
    const result = getOutput(container);

    expect(result.sortedAgents.map((m) => m.handle)).toEqual(['bob', 'dave', 'alice', 'carol']);

    unmount();
  });

  it('computes liveToolMix from members', () => {
    mockContextData = {
      members: [
        { agent_id: 'a1', handle: 'alice', status: 'active', host_tool: 'cursor' },
        { agent_id: 'a2', handle: 'bob', status: 'active', host_tool: 'cursor' },
        { agent_id: 'a3', handle: 'carol', status: 'active', host_tool: 'claude' },
        { agent_id: 'a4', handle: 'dave', status: 'offline', host_tool: 'vscode' },
      ],
    };
    const { container, unmount } = render(<HookOutput />);
    const result = getOutput(container);

    // Our mock builds tool mix from active members only
    expect(result.liveToolMix).toHaveLength(2);
    const cursorEntry = result.liveToolMix.find((e) => e.tool === 'cursor');
    expect(cursorEntry.value).toBe(2);
    const claudeEntry = result.liveToolMix.find((e) => e.tool === 'claude');
    expect(claudeEntry.value).toBe(1);

    unmount();
  });

  it('handles all-active members', () => {
    mockContextData = {
      members: [
        { agent_id: 'a1', handle: 'alice', status: 'active', host_tool: 'cursor' },
        { agent_id: 'a2', handle: 'bob', status: 'active', host_tool: 'claude' },
      ],
    };
    const { container, unmount } = render(<HookOutput />);
    const result = getOutput(container);

    expect(result.activeAgents).toHaveLength(2);
    expect(result.offlineAgents).toHaveLength(0);
    expect(result.sortedAgents).toHaveLength(2);

    unmount();
  });

  it('handles all-offline members', () => {
    mockContextData = {
      members: [
        { agent_id: 'a1', handle: 'alice', status: 'offline', host_tool: 'cursor' },
        { agent_id: 'a2', handle: 'bob', status: 'offline', host_tool: 'claude' },
      ],
    };
    const { container, unmount } = render(<HookOutput />);
    const result = getOutput(container);

    expect(result.activeAgents).toHaveLength(0);
    expect(result.offlineAgents).toHaveLength(2);
    expect(result.sortedAgents).toHaveLength(2);
    expect(result.liveToolMix).toEqual([]);

    unmount();
  });
});
