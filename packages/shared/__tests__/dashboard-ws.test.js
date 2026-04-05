import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeDashboardDeltaEvent, applyDelta } from '../dashboard-ws.js';

describe('dashboard-ws', () => {
  let baseContext;

  beforeEach(() => {
    baseContext = {
      members: [
        {
          agent_id: 'agent-1',
          handle: 'alice',
          host_tool: 'claude-code',
          status: 'active',
          seconds_since_update: 10,
          activity: { files: ['src/a.js'], summary: 'working on stuff' },
        },
        {
          agent_id: 'agent-2',
          handle: 'bob',
          host_tool: 'cursor',
          status: 'idle',
          seconds_since_update: 120,
          activity: null,
        },
      ],
      locks: [],
      messages: [],
      memories: [],
    };
  });

  describe('normalizeDashboardDeltaEvent', () => {
    it('returns null for non-object input', () => {
      expect(normalizeDashboardDeltaEvent(null)).toBeNull();
      expect(normalizeDashboardDeltaEvent(undefined)).toBeNull();
      expect(normalizeDashboardDeltaEvent('string')).toBeNull();
      expect(normalizeDashboardDeltaEvent(42)).toBeNull();
      expect(normalizeDashboardDeltaEvent(true)).toBeNull();
    });

    it('returns null for object without type', () => {
      expect(normalizeDashboardDeltaEvent({ agent_id: 'a' })).toBeNull();
    });

    it('returns null for object with non-string type', () => {
      expect(normalizeDashboardDeltaEvent({ type: 123 })).toBeNull();
    });

    it('returns null for invalid/unknown type', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'unknown_event' })).toBeNull();
      expect(normalizeDashboardDeltaEvent({ type: 'foobar' })).toBeNull();
    });

    it('normalizes a valid heartbeat event', () => {
      const result = normalizeDashboardDeltaEvent({ type: 'heartbeat', agent_id: 'agent-1' });
      expect(result).toEqual({ type: 'heartbeat', agent_id: 'agent-1' });
    });

    it('returns null for heartbeat without agent_id', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'heartbeat' })).toBeNull();
    });

    it('normalizes a valid activity event with files and summary', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'activity',
        agent_id: 'agent-1',
        files: ['src/a.js', 'src/b.js'],
        summary: 'refactoring',
      });
      expect(result).toEqual({
        type: 'activity',
        agent_id: 'agent-1',
        files: ['src/a.js', 'src/b.js'],
        summary: 'refactoring',
      });
    });

    it('returns null for activity without agent_id', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'activity', files: ['x'] })).toBeNull();
    });

    it('normalizes activity with optional fields missing', () => {
      const result = normalizeDashboardDeltaEvent({ type: 'activity', agent_id: 'a' });
      expect(result).toEqual({
        type: 'activity',
        agent_id: 'a',
        files: undefined,
        summary: null,
      });
    });

    it('normalizes a valid file event', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'file',
        agent_id: 'agent-1',
        file: 'src/x.js',
      });
      expect(result).toEqual({ type: 'file', agent_id: 'agent-1', file: 'src/x.js' });
    });

    it('returns null for file event without file field', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'file', agent_id: 'a' })).toBeNull();
    });

    it('normalizes a valid member_joined with all fields', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'member_joined',
        agent_id: 'agent-1',
        handle: 'alice',
        host_tool: 'cursor',
      });
      expect(result).toEqual({
        type: 'member_joined',
        agent_id: 'agent-1',
        handle: 'alice',
        host_tool: 'cursor',
      });
    });

    it('normalizes member_joined with tool field fallback for host_tool', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'member_joined',
        agent_id: 'agent-1',
        tool: 'windsurf',
      });
      expect(result.host_tool).toBe('windsurf');
    });

    it('returns null for member_joined without agent_id', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'member_joined', handle: 'alice' })).toBeNull();
    });

    it('normalizes a valid member_left event', () => {
      const result = normalizeDashboardDeltaEvent({ type: 'member_left', agent_id: 'agent-1' });
      expect(result).toEqual({ type: 'member_left', agent_id: 'agent-1' });
    });

    it('returns null for member_left without agent_id', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'member_left' })).toBeNull();
    });

    it('normalizes a valid status_change event', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'status_change',
        agent_id: 'agent-1',
        status: 'idle',
      });
      expect(result).toEqual({ type: 'status_change', agent_id: 'agent-1', status: 'idle' });
    });

    it('returns null for status_change with invalid status', () => {
      expect(
        normalizeDashboardDeltaEvent({
          type: 'status_change',
          agent_id: 'a',
          status: 'invalid',
        }),
      ).toBeNull();
    });

    it('returns null for status_change without agent_id', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'status_change', status: 'active' })).toBeNull();
    });

    it('normalizes valid lock_change claim event', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'lock_change',
        action: 'claim',
        agent_id: 'agent-1',
        files: ['src/a.js'],
      });
      expect(result).toEqual({
        type: 'lock_change',
        action: 'claim',
        agent_id: 'agent-1',
        files: ['src/a.js'],
      });
    });

    it('normalizes valid lock_change release event', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'lock_change',
        action: 'release',
        agent_id: 'agent-1',
        files: ['src/b.js'],
      });
      expect(result.action).toBe('release');
    });

    it('normalizes valid lock_change release_all event', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'lock_change',
        action: 'release_all',
        agent_id: 'agent-1',
      });
      expect(result.action).toBe('release_all');
    });

    it('returns null for lock_change with invalid action', () => {
      expect(
        normalizeDashboardDeltaEvent({
          type: 'lock_change',
          action: 'invalid',
          agent_id: 'a',
        }),
      ).toBeNull();
    });

    it('returns null for lock_change without agent_id', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'lock_change', action: 'claim' })).toBeNull();
    });

    it('normalizes a valid message event', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'message',
        handle: 'alice',
        text: 'hello world',
        created_at: '2024-01-01T00:00:00Z',
      });
      expect(result).toEqual({
        type: 'message',
        handle: 'alice',
        text: 'hello world',
        created_at: '2024-01-01T00:00:00Z',
      });
    });

    it('falls back from_handle to handle for message event', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'message',
        from_handle: 'bob',
        text: 'hi',
      });
      expect(result.handle).toBe('bob');
    });

    it('returns null for message without text', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'message', handle: 'a' })).toBeNull();
    });

    it('returns null for message without handle or from_handle', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'message', text: 'hi' })).toBeNull();
    });

    it('normalizes a valid memory event', () => {
      const result = normalizeDashboardDeltaEvent({
        type: 'memory',
        id: 'mem-1',
        text: 'remember this',
        tags: ['important'],
        handle: 'alice',
        host_tool: 'cursor',
        created_at: '2024-01-01T00:00:00Z',
      });
      expect(result).toEqual({
        type: 'memory',
        id: 'mem-1',
        text: 'remember this',
        tags: ['important'],
        handle: 'alice',
        host_tool: 'cursor',
        created_at: '2024-01-01T00:00:00Z',
      });
    });

    it('returns null for memory without text', () => {
      expect(normalizeDashboardDeltaEvent({ type: 'memory', id: 'mem-1' })).toBeNull();
    });

    it('normalizes memory with optional fields missing (generates no id)', () => {
      const result = normalizeDashboardDeltaEvent({ type: 'memory', text: 'bare' });
      expect(result.text).toBe('bare');
      expect(result.id).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });
  });

  describe('applyDelta - general', () => {
    it('returns context unchanged for null context', () => {
      expect(applyDelta(null, { type: 'heartbeat' })).toBeNull();
    });

    it('returns context unchanged for undefined context', () => {
      expect(applyDelta(undefined, { type: 'heartbeat' })).toBeUndefined();
    });

    it('returns context unchanged for null event', () => {
      expect(applyDelta(baseContext, null)).toBe(baseContext);
    });

    it('returns context unchanged for event without type', () => {
      expect(applyDelta(baseContext, {})).toBe(baseContext);
    });

    it('returns context unchanged for unknown event type', () => {
      expect(applyDelta(baseContext, { type: 'unknown_event' })).toBe(baseContext);
    });

    it('returns new context object (immutability)', () => {
      const result = applyDelta(baseContext, { type: 'heartbeat', agent_id: 'agent-1' });
      expect(result).not.toBe(baseContext);
    });
  });

  describe('heartbeat', () => {
    it('resets seconds_since_update and sets status to active for matching agent', () => {
      const result = applyDelta(baseContext, { type: 'heartbeat', agent_id: 'agent-2' });
      const bob = result.members.find((m) => m.agent_id === 'agent-2');
      expect(bob.status).toBe('active');
      expect(bob.seconds_since_update).toBe(0);
    });

    it('does not affect other members', () => {
      const result = applyDelta(baseContext, { type: 'heartbeat', agent_id: 'agent-2' });
      const alice = result.members.find((m) => m.agent_id === 'agent-1');
      expect(alice.seconds_since_update).toBe(10);
    });

    it('does not mutate original members array', () => {
      const originalMembers = [...baseContext.members];
      applyDelta(baseContext, { type: 'heartbeat', agent_id: 'agent-1' });
      expect(baseContext.members).toEqual(originalMembers);
    });
  });

  describe('activity', () => {
    it('updates activity with files and summary for matching agent', () => {
      const event = {
        type: 'activity',
        agent_id: 'agent-1',
        files: ['src/b.js', 'src/c.js'],
        summary: 'refactoring',
      };
      const result = applyDelta(baseContext, event);
      const alice = result.members.find((m) => m.agent_id === 'agent-1');
      expect(alice.activity.files).toEqual(['src/b.js', 'src/c.js']);
      expect(alice.activity.summary).toBe('refactoring');
      expect(alice.status).toBe('active');
      expect(alice.seconds_since_update).toBe(0);
    });

    it('defaults files to empty array and summary to null when missing', () => {
      const event = { type: 'activity', agent_id: 'agent-1' };
      const result = applyDelta(baseContext, event);
      const alice = result.members.find((m) => m.agent_id === 'agent-1');
      expect(alice.activity.files).toEqual([]);
      expect(alice.activity.summary).toBeNull();
    });
  });

  describe('file (file report)', () => {
    it('adds a new file to the activity files list', () => {
      const event = { type: 'file', agent_id: 'agent-1', file: 'src/new.js' };
      const result = applyDelta(baseContext, event);
      const alice = result.members.find((m) => m.agent_id === 'agent-1');
      expect(alice.activity.files).toContain('src/new.js');
      expect(alice.activity.files).toContain('src/a.js');
    });

    it('does not add duplicate files', () => {
      const event = { type: 'file', agent_id: 'agent-1', file: 'src/a.js' };
      const result = applyDelta(baseContext, event);
      const alice = result.members.find((m) => m.agent_id === 'agent-1');
      expect(alice.activity.files.filter((f) => f === 'src/a.js')).toHaveLength(1);
    });

    it('initializes files array when activity is null', () => {
      const event = { type: 'file', agent_id: 'agent-2', file: 'src/x.js' };
      const result = applyDelta(baseContext, event);
      const bob = result.members.find((m) => m.agent_id === 'agent-2');
      expect(bob.activity.files).toEqual(['src/x.js']);
    });
  });

  describe('member_joined', () => {
    it('adds a new member when agent_id does not exist', () => {
      const event = {
        type: 'member_joined',
        agent_id: 'agent-3',
        handle: 'charlie',
        host_tool: 'windsurf',
      };
      const result = applyDelta(baseContext, event);
      expect(result.members).toHaveLength(3);
      const charlie = result.members.find((m) => m.agent_id === 'agent-3');
      expect(charlie.handle).toBe('charlie');
      expect(charlie.host_tool).toBe('windsurf');
      expect(charlie.status).toBe('active');
      expect(charlie.seconds_since_update).toBe(0);
      expect(charlie.activity).toBeNull();
    });

    it('updates existing member on re-join', () => {
      const event = {
        type: 'member_joined',
        agent_id: 'agent-2',
        handle: 'bob_v2',
        host_tool: 'vscode',
      };
      const result = applyDelta(baseContext, event);
      expect(result.members).toHaveLength(2);
      const bob = result.members.find((m) => m.agent_id === 'agent-2');
      expect(bob.handle).toBe('bob_v2');
      expect(bob.host_tool).toBe('vscode');
      expect(bob.status).toBe('active');
    });

    it('defaults handle and host tool to "unknown" when not provided', () => {
      const event = { type: 'member_joined', agent_id: 'agent-4' };
      const result = applyDelta(baseContext, event);
      const newMember = result.members.find((m) => m.agent_id === 'agent-4');
      expect(newMember.handle).toBe('unknown');
      expect(newMember.host_tool).toBe('unknown');
    });

    it('handles context with no members array', () => {
      const result = applyDelta(
        {},
        { type: 'member_joined', agent_id: 'x', handle: 'h', host_tool: 't' },
      );
      expect(result.members).toHaveLength(1);
      expect(result.members[0].agent_id).toBe('x');
    });
  });

  describe('member_left', () => {
    it('removes matching member', () => {
      const result = applyDelta(baseContext, { type: 'member_left', agent_id: 'agent-1' });
      expect(result.members).toHaveLength(1);
      expect(result.members[0].agent_id).toBe('agent-2');
    });

    it('no-ops for unknown agent_id', () => {
      const result = applyDelta(baseContext, { type: 'member_left', agent_id: 'nonexistent' });
      expect(result.members).toHaveLength(2);
    });
  });

  describe('status_change', () => {
    it('updates status for matching agent', () => {
      const result = applyDelta(baseContext, {
        type: 'status_change',
        agent_id: 'agent-1',
        status: 'idle',
      });
      const alice = result.members.find((m) => m.agent_id === 'agent-1');
      expect(alice.status).toBe('idle');
    });

    it('does not affect other members', () => {
      const result = applyDelta(baseContext, {
        type: 'status_change',
        agent_id: 'agent-1',
        status: 'idle',
      });
      const bob = result.members.find((m) => m.agent_id === 'agent-2');
      expect(bob.status).toBe('idle');
    });
  });

  describe('lock_change', () => {
    it('adds locks on claim action', () => {
      const event = {
        type: 'lock_change',
        action: 'claim',
        agent_id: 'agent-1',
        files: ['src/a.js', 'src/b.js'],
      };
      const result = applyDelta(baseContext, event);
      expect(result.locks).toHaveLength(2);
      expect(result.locks[0]).toEqual({ file_path: 'src/a.js', agent_id: 'agent-1' });
      expect(result.locks[1]).toEqual({ file_path: 'src/b.js', agent_id: 'agent-1' });
    });

    it('duplicate locks accumulate on repeated claim (potential issue)', () => {
      // NOTE: The current implementation does NOT deduplicate locks on claim.
      // If the same agent claims the same file twice, duplicates appear.
      // This documents the current behavior.
      const event = {
        type: 'lock_change',
        action: 'claim',
        agent_id: 'agent-1',
        files: ['src/a.js'],
      };
      const ctx1 = applyDelta(baseContext, event);
      const ctx2 = applyDelta(ctx1, event);
      expect(ctx2.locks).toHaveLength(2);
      expect(ctx2.locks[0]).toEqual({ file_path: 'src/a.js', agent_id: 'agent-1' });
      expect(ctx2.locks[1]).toEqual({ file_path: 'src/a.js', agent_id: 'agent-1' });
    });

    it('removes specific locks on release action', () => {
      const ctx = {
        ...baseContext,
        locks: [
          { file_path: 'src/a.js', agent_id: 'agent-1' },
          { file_path: 'src/b.js', agent_id: 'agent-1' },
          { file_path: 'src/c.js', agent_id: 'agent-2' },
        ],
      };
      const event = {
        type: 'lock_change',
        action: 'release',
        agent_id: 'agent-1',
        files: ['src/a.js'],
      };
      const result = applyDelta(ctx, event);
      expect(result.locks).toHaveLength(2);
      expect(result.locks.find((l) => l.file_path === 'src/a.js')).toBeUndefined();
    });

    it('only releases locks owned by the requesting agent', () => {
      const ctx = {
        ...baseContext,
        locks: [
          { file_path: 'src/a.js', agent_id: 'agent-1' },
          { file_path: 'src/a.js', agent_id: 'agent-2' },
        ],
      };
      const event = {
        type: 'lock_change',
        action: 'release',
        agent_id: 'agent-1',
        files: ['src/a.js'],
      };
      const result = applyDelta(ctx, event);
      expect(result.locks).toHaveLength(1);
      expect(result.locks[0].agent_id).toBe('agent-2');
    });

    it('releases all locks for agent on release_all action', () => {
      const ctx = {
        ...baseContext,
        locks: [
          { file_path: 'src/a.js', agent_id: 'agent-1' },
          { file_path: 'src/b.js', agent_id: 'agent-1' },
          { file_path: 'src/c.js', agent_id: 'agent-2' },
        ],
      };
      const event = {
        type: 'lock_change',
        action: 'release_all',
        agent_id: 'agent-1',
      };
      const result = applyDelta(ctx, event);
      expect(result.locks).toHaveLength(1);
      expect(result.locks[0].agent_id).toBe('agent-2');
    });

    it('handles claim with empty files array', () => {
      const event = {
        type: 'lock_change',
        action: 'claim',
        agent_id: 'agent-1',
        files: [],
      };
      const result = applyDelta(baseContext, event);
      expect(result.locks).toHaveLength(0);
    });

    it('handles context with no locks array', () => {
      const ctx = { members: [] };
      const event = {
        type: 'lock_change',
        action: 'claim',
        agent_id: 'agent-1',
        files: ['x.js'],
      };
      const result = applyDelta(ctx, event);
      expect(result.locks).toHaveLength(1);
    });
  });

  describe('message', () => {
    it('appends a message to the messages array', () => {
      const event = { type: 'message', handle: 'alice', text: 'hello' };
      const result = applyDelta(baseContext, event);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].handle).toBe('alice');
      expect(result.messages[0].text).toBe('hello');
      expect(result.messages[0].created_at).toBeDefined();
    });

    it('caps messages at 50', () => {
      const ctx = {
        ...baseContext,
        messages: Array.from({ length: 50 }, (_, i) => ({
          handle: 'user',
          text: `msg ${i}`,
          created_at: new Date().toISOString(),
        })),
      };
      const event = { type: 'message', handle: 'alice', text: 'new message' };
      const result = applyDelta(ctx, event);
      expect(result.messages).toHaveLength(50);
      expect(result.messages[49].text).toBe('new message');
      expect(result.messages[0].text).toBe('msg 1');
    });

    it('handles context with no messages array', () => {
      const result = applyDelta({ members: [] }, { type: 'message', handle: 'x', text: 'hi' });
      expect(result.messages).toHaveLength(1);
    });

    it('respects custom maxMessages limit', () => {
      const ctx = {
        ...baseContext,
        messages: Array.from({ length: 5 }, (_, i) => ({
          handle: 'user',
          text: `msg ${i}`,
          created_at: new Date().toISOString(),
        })),
      };
      const event = { type: 'message', handle: 'alice', text: 'new' };
      const result = applyDelta(ctx, event, { maxMessages: 3 });
      expect(result.messages).toHaveLength(3);
      expect(result.messages[2].text).toBe('new');
    });
  });

  describe('memory', () => {
    it('prepends a memory to the memories array', () => {
      const event = { type: 'memory', text: 'remember this', tags: ['important'] };
      const result = applyDelta(baseContext, event);
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].text).toBe('remember this');
      expect(result.memories[0].tags).toEqual(['important']);
      expect(result.memories[0].created_at).toBeDefined();
    });

    it('defaults tags to empty array when not provided', () => {
      const event = { type: 'memory', text: 'no tags' };
      const result = applyDelta(baseContext, event);
      expect(result.memories[0].tags).toEqual([]);
    });

    it('caps memories at 100', () => {
      const ctx = {
        ...baseContext,
        memories: Array.from({ length: 100 }, (_, i) => ({
          text: `mem ${i}`,
          tags: [],
          created_at: new Date().toISOString(),
        })),
      };
      const event = { type: 'memory', text: 'new memory' };
      const result = applyDelta(ctx, event);
      expect(result.memories).toHaveLength(100);
      expect(result.memories[0].text).toBe('new memory');
    });

    it('new memories appear at the front (most recent first)', () => {
      const ctx = {
        ...baseContext,
        memories: [{ text: 'old', tags: [], created_at: '2024-01-01T00:00:00Z' }],
      };
      const event = { type: 'memory', text: 'new' };
      const result = applyDelta(ctx, event);
      expect(result.memories[0].text).toBe('new');
      expect(result.memories[1].text).toBe('old');
    });

    it('respects custom maxMemories limit', () => {
      const ctx = {
        ...baseContext,
        memories: Array.from({ length: 5 }, (_, i) => ({
          id: `mem-${i}`,
          text: `mem ${i}`,
          tags: [],
          created_at: new Date().toISOString(),
        })),
      };
      const event = { type: 'memory', text: 'newest' };
      const result = applyDelta(ctx, event, { maxMemories: 3 });
      expect(result.memories).toHaveLength(3);
      expect(result.memories[0].text).toBe('newest');
    });

    it('generates an ID if missing from the event', () => {
      const event = { type: 'memory', text: 'no id' };
      const result = applyDelta(baseContext, event);
      expect(result.memories[0].id).toMatch(/^memory:\d+$/);
    });
  });

  describe('activity updated_at', () => {
    it('sets updated_at on activity events', () => {
      const event = {
        type: 'activity',
        agent_id: 'agent-1',
        files: ['src/z.js'],
        summary: 'test',
      };
      const result = applyDelta(baseContext, event);
      const alice = result.members.find((m) => m.agent_id === 'agent-1');
      expect(alice.activity.updated_at).toBeDefined();
      expect(typeof alice.activity.updated_at).toBe('string');
    });
  });
});
