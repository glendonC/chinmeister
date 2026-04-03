import { describe, it, expect } from 'vitest';
import {
  buildDashboardView,
  buildCombinedAgentRows,
  countLiveAgents,
  createToolNameResolver,
  formatDuration,
  formatFiles,
  smartSummary,
  shortAgentId,
  hasVisibleSessionActivity,
  MAX_MEMORIES,
} from '../dashboard/view.js';

describe('formatDuration edge cases', () => {
  it('returns null for null/undefined', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
  });

  it('rounds to nearest minute', () => {
    expect(formatDuration(0.4)).toBe('0 min');
    expect(formatDuration(1.5)).toBe('2 min');
  });

  it('formats exact hours without remainder', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
  });
});

describe('formatFiles edge cases', () => {
  it('returns null for empty/null', () => {
    expect(formatFiles(null)).toBeNull();
    expect(formatFiles([])).toBeNull();
  });

  it('shows single file name', () => {
    expect(formatFiles(['src/auth.js'])).toBe('auth.js');
  });

  it('shows two files', () => {
    expect(formatFiles(['src/a.js', 'src/b.js'])).toBe('a.js, b.js');
  });

  it('shows three files', () => {
    expect(formatFiles(['src/a.js', 'src/b.js', 'src/c.js'])).toBe('a.js, b.js, c.js');
  });

  it('collapses 4+ files with count', () => {
    expect(formatFiles(['a.js', 'b.js', 'c.js', 'd.js', 'e.js'])).toBe('a.js, b.js + 3 more');
  });

  it('separates media files from code', () => {
    const result = formatFiles(['src/app.js', 'assets/logo.png']);
    expect(result).toContain('app.js');
    expect(result).toContain('1 image');
  });

  it('shows only media count when all files are media', () => {
    const result = formatFiles(['a.png', 'b.jpg', 'c.gif']);
    expect(result).toBe('3 images');
  });

  it('shows singular image label', () => {
    expect(formatFiles(['logo.png'])).toBe('1 image');
  });
});

describe('smartSummary edge cases', () => {
  it('returns null when no activity', () => {
    expect(smartSummary(null)).toBeNull();
    expect(smartSummary({})).toBeNull();
    expect(smartSummary({ summary: null })).toBeNull();
  });

  it('suppresses "Editing" prefix summaries', () => {
    expect(smartSummary({ summary: 'Editing files' })).toBeNull();
    expect(smartSummary({ summary: 'editing src/app.js' })).toBeNull();
  });

  it('suppresses summary that just names the only file', () => {
    expect(
      smartSummary({ summary: 'Working on app.js changes', files: ['src/app.js'] }),
    ).toBeNull();
  });

  it('keeps meaningful summaries', () => {
    expect(smartSummary({ summary: 'Implementing OAuth2 flow', files: ['src/auth.js'] })).toBe(
      'Implementing OAuth2 flow',
    );
  });
});

describe('createToolNameResolver edge cases', () => {
  it('returns null for null/unknown tool ids', () => {
    const resolve = createToolNameResolver([]);
    expect(resolve(null)).toBeNull();
    expect(resolve('unknown')).toBeNull();
  });

  it('returns the tool id itself when not in map', () => {
    const resolve = createToolNameResolver([]);
    expect(resolve('aider')).toBe('aider');
  });
});

describe('shortAgentId edge cases', () => {
  it('returns empty string for null', () => {
    expect(shortAgentId(null)).toBe('');
    expect(shortAgentId(undefined)).toBe('');
  });

  it('returns empty for ids with fewer than 3 parts', () => {
    expect(shortAgentId('only-one')).toBe('');
    expect(shortAgentId('two:parts')).toBe('');
  });

  it('returns first 4 chars of third segment', () => {
    expect(shortAgentId('tool:session:abcdefgh')).toBe('abcd');
  });
});

describe('hasVisibleSessionActivity edge cases', () => {
  it('returns false for null', () => {
    expect(hasVisibleSessionActivity(null)).toBe(false);
  });

  it('returns true for active sessions (no ended_at)', () => {
    expect(hasVisibleSessionActivity({ ended_at: null, edit_count: 0, files_touched: [] })).toBe(
      true,
    );
  });
});

describe('buildDashboardView edge cases', () => {
  it('handles empty context', () => {
    const view = buildDashboardView({ context: null, cols: 80, detectedTools: [] });
    expect(view.activeAgents).toEqual([]);
    expect(view.conflicts).toEqual([]);
    expect(view.memories).toEqual([]);
    expect(view.showRecent).toBe(false);
  });

  it('handles empty members', () => {
    const view = buildDashboardView({
      context: { members: [], memories: [], messages: [] },
      cols: 80,
      detectedTools: [],
    });
    expect(view.activeAgents).toEqual([]);
    expect(view.isTeam).toBe(false);
  });

  it('filters out dashboard and unknown tool agents', () => {
    const view = buildDashboardView({
      context: {
        members: [
          {
            agent_id: 'dashboard:abc',
            tool: 'dashboard',
            host_tool: 'dashboard',
            status: 'active',
            handle: 'alice',
            activity: {},
          },
          {
            agent_id: 'unknown:abc',
            tool: 'unknown',
            host_tool: 'unknown',
            status: 'active',
            handle: 'alice',
            activity: {},
          },
          {
            agent_id: 'claude-code:abc:def',
            tool: 'claude-code',
            host_tool: 'claude-code',
            status: 'active',
            handle: 'alice',
            activity: {},
          },
        ],
      },
      cols: 80,
      detectedTools: [],
    });
    expect(view.activeAgents).toHaveLength(1);
    expect(view.activeAgents[0].tool).toBe('claude-code');
  });

  it('detects multi-handle teams', () => {
    const view = buildDashboardView({
      context: {
        members: [
          {
            agent_id: 'a:1:1',
            tool: 'claude-code',
            host_tool: 'claude-code',
            status: 'active',
            handle: 'alice',
            activity: {},
          },
          {
            agent_id: 'b:1:1',
            tool: 'cursor',
            host_tool: 'cursor',
            status: 'active',
            handle: 'bob',
            activity: {},
          },
        ],
      },
      cols: 80,
      detectedTools: [],
    });
    expect(view.isTeam).toBe(true);
  });

  it('filters memories by search query', () => {
    const view = buildDashboardView({
      context: {
        members: [],
        memories: [
          { id: '1', text: 'Use TeamDO for coordination', tags: ['architecture'] },
          { id: '2', text: 'Deploy on port 8787', tags: ['config'] },
        ],
      },
      cols: 80,
      detectedTools: [],
      memorySearch: 'TeamDO',
    });
    expect(view.filteredMemories).toHaveLength(1);
    expect(view.filteredMemories[0].id).toBe('1');
  });

  it('filters memories by tag search query', () => {
    const view = buildDashboardView({
      context: {
        members: [],
        memories: [
          { id: '1', text: 'Use TeamDO', tags: ['architecture'] },
          { id: '2', text: 'Port config', tags: ['config'] },
        ],
      },
      cols: 80,
      detectedTools: [],
      memorySearch: 'config',
    });
    expect(view.filteredMemories).toHaveLength(1);
    expect(view.filteredMemories[0].id).toBe('2');
  });

  it('limits visible memories to MAX_MEMORIES', () => {
    const memories = Array.from({ length: 15 }, (_, i) => ({
      id: `m${i}`,
      text: `Memory ${i}`,
      tags: ['test'],
    }));
    const view = buildDashboardView({
      context: { members: [], memories },
      cols: 80,
      detectedTools: [],
    });
    expect(view.visibleMemories.length).toBeLessThanOrEqual(MAX_MEMORIES);
    expect(view.memoryOverflow).toBe(15 - MAX_MEMORIES);
  });

  it('shows recent sessions when no active agents', () => {
    const view = buildDashboardView({
      context: {
        members: [],
        sessions: [
          { owner_handle: 'alice', duration_minutes: 10, edit_count: 5, files_touched: ['app.js'] },
        ],
      },
      cols: 80,
      detectedTools: [],
    });
    expect(view.showRecent).toBe(true);
    expect(view.recentSessions).toHaveLength(1);
  });

  it('hides recent sessions when active agents exist', () => {
    const view = buildDashboardView({
      context: {
        members: [
          {
            agent_id: 'a:1:1',
            tool: 'claude-code',
            host_tool: 'claude-code',
            status: 'active',
            handle: 'alice',
            activity: {},
          },
        ],
        sessions: [
          { owner_handle: 'alice', duration_minutes: 10, edit_count: 5, files_touched: ['app.js'] },
        ],
      },
      cols: 80,
      detectedTools: [],
    });
    expect(view.showRecent).toBe(false);
  });

  it('computes tool counts from active agents', () => {
    const view = buildDashboardView({
      context: {
        members: [
          {
            agent_id: 'a:1:1',
            tool: 'claude-code',
            host_tool: 'claude-code',
            status: 'active',
            handle: 'alice',
            activity: {},
          },
          {
            agent_id: 'a:1:2',
            tool: 'claude-code',
            host_tool: 'claude-code',
            status: 'active',
            handle: 'alice',
            activity: {},
          },
          {
            agent_id: 'b:1:1',
            tool: 'cursor',
            host_tool: 'cursor',
            status: 'active',
            handle: 'bob',
            activity: {},
          },
        ],
      },
      cols: 80,
      detectedTools: [],
    });
    expect(view.toolCounts.get('claude-code')).toBe(2);
    expect(view.toolCounts.get('cursor')).toBe(1);
  });
});

describe('buildCombinedAgentRows edge cases', () => {
  const getToolName = createToolNameResolver([{ id: 'claude-code', name: 'Claude Code' }]);

  it('handles empty inputs', () => {
    const rows = buildCombinedAgentRows({});
    expect(rows).toEqual([]);
  });

  it('shows connected-only agents when no managed agents', () => {
    const rows = buildCombinedAgentRows({
      managedAgents: [],
      connectedAgents: [
        {
          agent_id: 'cursor:abc:def',
          tool: 'cursor',
          status: 'active',
          handle: 'bob',
          activity: {},
        },
      ],
      getToolName,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]._managed).toBe(false);
    expect(rows[0]._connected).toBe(true);
  });

  it('shows managed-only agents when no connected agents', () => {
    const rows = buildCombinedAgentRows({
      managedAgents: [
        {
          toolId: 'claude-code',
          toolName: 'Claude Code',
          cmd: 'claude',
          task: 'test',
          cwd: '/repo',
          status: 'running',
          startedAt: Date.now(),
          exitCode: null,
        },
      ],
      connectedAgents: [],
      getToolName,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]._managed).toBe(true);
    expect(rows[0]._connected).toBe(false);
  });

  it('marks exited agents as dead', () => {
    const rows = buildCombinedAgentRows({
      managedAgents: [
        {
          toolId: 'claude-code',
          toolName: 'Claude Code',
          cmd: 'claude',
          task: 'test',
          cwd: '/repo',
          status: 'exited',
          startedAt: Date.now() - 60000,
          exitCode: 0,
        },
      ],
      connectedAgents: [],
      getToolName,
    });
    expect(rows[0]._dead).toBe(true);
    expect(rows[0]._failed).toBe(false);
  });

  it('marks failed agents as dead and failed', () => {
    const rows = buildCombinedAgentRows({
      managedAgents: [
        {
          toolId: 'claude-code',
          toolName: 'Claude Code',
          cmd: 'claude',
          task: 'test',
          cwd: '/repo',
          status: 'failed',
          startedAt: Date.now() - 60000,
          exitCode: 1,
        },
      ],
      connectedAgents: [],
      getToolName,
    });
    expect(rows[0]._dead).toBe(true);
    expect(rows[0]._failed).toBe(true);
    expect(rows[0]._exitCode).toBe(1);
  });
});

describe('countLiveAgents', () => {
  it('returns 0 for null/empty', () => {
    expect(countLiveAgents(null)).toBe(0);
    expect(countLiveAgents([])).toBe(0);
  });

  it('counts running managed agents as live', () => {
    expect(
      countLiveAgents([
        { _managed: true, status: 'running' },
        { _managed: true, status: 'exited' },
      ]),
    ).toBe(1);
  });

  it('counts active connected agents as live', () => {
    expect(
      countLiveAgents([
        { _managed: false, status: 'active' },
        { _managed: false, status: 'idle' },
      ]),
    ).toBe(1);
  });
});
