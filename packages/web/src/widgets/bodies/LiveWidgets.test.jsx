// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { liveWidgets } from './LiveWidgets.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Two agents working on the same file -> a conflict in the live-conflicts
// widget body. Files-in-play renders the same row regardless of agent
// count, so a single agent on a file is enough for that body.
function makeAgent(handle, file) {
  return {
    agent_id: `a_${handle}`,
    handle,
    host_tool: 'claude-code',
    agent_surface: null,
    files: [file],
    summary: null,
    session_minutes: 5,
    seconds_since_update: 1,
    teamId: 't_one',
    teamName: 'one',
  };
}

function renderBody(Body, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Body {...props} />);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

const baseProps = {
  analytics: {},
  conversationData: {},
  summaries: [],
  truncated: false,
  selectTeam: () => {},
};

describe('LiveConflictsWidget Status column', () => {
  it('renders the Status header and cell when at least one rendered file has a lock', () => {
    const agents = [makeAgent('ada', 'src/router.ts'), makeAgent('nova', 'src/router.ts')];
    const locks = [
      {
        file_path: 'src/router.ts',
        agent_id: 'a_ada',
        handle: 'ada',
        host_tool: 'claude-code',
        minutes_held: 12,
      },
    ];

    const Body = liveWidgets['live-conflicts'];
    const { container, unmount } = renderBody(Body, { ...baseProps, liveAgents: agents, locks });

    expect(container.textContent).toContain('Status');
    // claimed | unclaimed | mismatch are the three legible status words
    const text = container.textContent || '';
    expect(/claimed|unclaimed|mismatch/.test(text)).toBe(true);
    unmount();
  });

  it('hides the Status column when no rendered file matches a lock', () => {
    // Two agents collide on a file, but `locks` is empty (cross-project
    // Overview shape). The column should drop entirely rather than
    // print an em-dash on every row.
    const agents = [makeAgent('ada', 'src/router.ts'), makeAgent('nova', 'src/router.ts')];

    const Body = liveWidgets['live-conflicts'];
    const { container, unmount } = renderBody(Body, {
      ...baseProps,
      liveAgents: agents,
      locks: [],
    });

    expect(container.textContent).not.toContain('Status');
    unmount();
  });
});

describe('FilesInPlayWidget Status column', () => {
  it('hides the Status column when locks array is empty', () => {
    const agents = [makeAgent('ada', 'src/file.ts')];

    const Body = liveWidgets['files-in-play'];
    const { container, unmount } = renderBody(Body, {
      ...baseProps,
      liveAgents: agents,
      locks: [],
    });

    expect(container.textContent).not.toContain('Status');
    unmount();
  });

  it('renders the Status column when at least one rendered file has a lock', () => {
    const agents = [makeAgent('ada', 'src/file.ts')];
    const locks = [
      {
        file_path: 'src/file.ts',
        agent_id: 'a_ada',
        handle: 'ada',
        host_tool: 'claude-code',
        minutes_held: 3,
      },
    ];

    const Body = liveWidgets['files-in-play'];
    const { container, unmount } = renderBody(Body, { ...baseProps, liveAgents: agents, locks });

    expect(container.textContent).toContain('Status');
    unmount();
  });
});
