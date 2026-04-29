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
function makeAgent(handle, file, opts = {}) {
  return {
    agent_id: `a_${handle}`,
    handle,
    host_tool: 'claude-code',
    agent_surface: null,
    files: [file],
    summary: null,
    session_minutes: 5,
    seconds_since_update: 1,
    teamId: opts.teamId ?? 't_one',
    teamName: opts.teamName ?? 'one',
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

describe('LiveConflictsWidget cross-project team disambiguator', () => {
  // Cross-project Overview can render two router.ts rows from different
  // repos; without a per-row team identity they are visually identical.
  // The widget surfaces the team name when the rendered set spans more
  // than one team and stays bare when only one team is present.
  it('renders the team identity inline when conflicts span more than one team', () => {
    const agents = [
      makeAgent('ada', 'src/router.ts', { teamId: 't_one', teamName: 'one' }),
      makeAgent('nova', 'src/router.ts', { teamId: 't_one', teamName: 'one' }),
      makeAgent('sky', 'src/router.ts', { teamId: 't_two', teamName: 'two' }),
      makeAgent('cyan', 'src/router.ts', { teamId: 't_two', teamName: 'two' }),
    ];

    const Body = liveWidgets['live-conflicts'];
    const { container, unmount } = renderBody(Body, {
      ...baseProps,
      liveAgents: agents,
      locks: [],
    });

    // Both team labels should appear somewhere in the rendered rows.
    // Each conflict row carries the team identity from its FileGroup,
    // so two collisions across two teams produce two label hits.
    const text = container.textContent || '';
    expect(text).toContain('one');
    expect(text).toContain('two');
    unmount();
  });

  it('hides the team identity when every rendered conflict is in one team', () => {
    const agents = [
      makeAgent('ada', 'src/router.ts', { teamId: 't_one', teamName: 'one' }),
      makeAgent('nova', 'src/router.ts', { teamId: 't_one', teamName: 'one' }),
    ];

    const Body = liveWidgets['live-conflicts'];
    const { container, unmount } = renderBody(Body, {
      ...baseProps,
      liveAgents: agents,
      locks: [],
    });

    // Single-team set: no per-row team suffix, only the file path.
    expect(container.textContent).not.toContain('one');
    unmount();
  });
});

describe('FilesInPlayWidget cross-project team disambiguator', () => {
  it('renders the team identity inline when files span more than one team', () => {
    const agents = [
      makeAgent('ada', 'src/router.ts', { teamId: 't_one', teamName: 'alpha' }),
      makeAgent('sky', 'src/util.ts', { teamId: 't_two', teamName: 'beta' }),
    ];

    const Body = liveWidgets['files-in-play'];
    const { container, unmount } = renderBody(Body, {
      ...baseProps,
      liveAgents: agents,
      locks: [],
    });

    const text = container.textContent || '';
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
    unmount();
  });

  it('hides the team identity when every rendered file is in one team', () => {
    const agents = [
      makeAgent('ada', 'src/router.ts', { teamId: 't_one', teamName: 'alpha' }),
      makeAgent('nova', 'src/util.ts', { teamId: 't_one', teamName: 'alpha' }),
    ];

    const Body = liveWidgets['files-in-play'];
    const { container, unmount } = renderBody(Body, {
      ...baseProps,
      liveAgents: agents,
      locks: [],
    });

    expect(container.textContent).not.toContain('alpha');
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
