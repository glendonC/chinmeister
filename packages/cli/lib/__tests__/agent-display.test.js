import { describe, it, expect } from 'vitest';
import {
  isAgentAddressable,
  getAgentTargetLabel,
  getAgentIntent,
  getAgentOriginLabel,
  getAgentDisplayLabel,
  getIntentColor,
  getAgentMeta,
  getRecentResultSummary,
} from '../dashboard/agent-display.js';

describe('isAgentAddressable', () => {
  it('returns false for null/undefined', () => {
    expect(isAgentAddressable(null)).toBe(false);
    expect(isAgentAddressable(undefined)).toBe(false);
  });

  it('returns false when agent_id is missing', () => {
    expect(isAgentAddressable({ status: 'running', _managed: true })).toBe(false);
  });

  it('returns true for running managed agents with agent_id', () => {
    expect(
      isAgentAddressable({ agent_id: 'test:abc:def', _managed: true, status: 'running' }),
    ).toBe(true);
  });

  it('returns false for exited managed agents', () => {
    expect(isAgentAddressable({ agent_id: 'test:abc:def', _managed: true, status: 'exited' })).toBe(
      false,
    );
  });

  it('returns true for active non-managed (connected) agents', () => {
    expect(
      isAgentAddressable({ agent_id: 'test:abc:def', _managed: false, status: 'active' }),
    ).toBe(true);
  });

  it('returns false for inactive non-managed agents', () => {
    expect(isAgentAddressable({ agent_id: 'test:abc:def', _managed: false, status: 'idle' })).toBe(
      false,
    );
  });
});

describe('getAgentTargetLabel', () => {
  it('returns "agent" for null', () => {
    expect(getAgentTargetLabel(null)).toBe('agent');
  });

  it('combines handle and display name', () => {
    expect(getAgentTargetLabel({ handle: 'alice', _display: 'Claude Code' })).toBe(
      'alice (Claude Code)',
    );
  });

  it('falls back to handle only', () => {
    expect(getAgentTargetLabel({ handle: 'alice' })).toBe('alice');
  });

  it('falls back to display only', () => {
    expect(getAgentTargetLabel({ _display: 'Claude Code' })).toBe('Claude Code');
  });
});

describe('getAgentIntent', () => {
  it('returns null for null agent', () => {
    expect(getAgentIntent(null)).toBeNull();
  });

  it('returns output preview for dead managed agents', () => {
    expect(
      getAgentIntent({
        _managed: true,
        _dead: true,
        outputPreview: 'Auth token expired',
      }),
    ).toBe('Auth token expired');
  });

  it('returns summary when available', () => {
    expect(
      getAgentIntent({
        _summary: 'Refactoring auth flow',
        activity: { files: ['src/auth.js'] },
      }),
    ).toBe('Refactoring auth flow');
  });

  it('returns file list when no summary', () => {
    const result = getAgentIntent({
      activity: { files: ['src/auth.js', 'src/login.js'] },
    });
    expect(result).toContain('auth.js');
  });

  it('returns task for managed agents with no other info', () => {
    expect(
      getAgentIntent({
        _managed: true,
        task: 'Fix login bug',
      }),
    ).toBe('Fix login bug');
  });

  it('returns Idle as fallback', () => {
    expect(getAgentIntent({})).toBe('Idle');
  });
});

describe('getAgentOriginLabel', () => {
  it('returns null for null agent', () => {
    expect(getAgentOriginLabel(null)).toBeNull();
  });

  it('returns "started here" for connected managed agents', () => {
    expect(getAgentOriginLabel({ _managed: true, _connected: true })).toBe('started here');
  });

  it('returns "starting here" for unconnected managed agents', () => {
    expect(getAgentOriginLabel({ _managed: true, _connected: false })).toBe('starting here');
  });

  it('returns "joined automatically" for non-managed agents', () => {
    expect(getAgentOriginLabel({ _managed: false })).toBe('joined automatically');
  });
});

describe('getAgentDisplayLabel', () => {
  it('returns "agent" for null', () => {
    expect(getAgentDisplayLabel(null)).toBe('agent');
  });

  it('returns display name', () => {
    expect(getAgentDisplayLabel({ _display: 'Claude Code' })).toBe('Claude Code');
  });

  it('falls back through toolName and tool', () => {
    expect(getAgentDisplayLabel({ toolName: 'Cursor' })).toBe('Cursor');
    expect(getAgentDisplayLabel({ tool: 'aider' })).toBe('aider');
  });

  it('appends index when multiple agents share the same name', () => {
    const agents = [
      { agent_id: 'a:1:1', _display: 'Claude Code' },
      { agent_id: 'a:1:2', _display: 'Claude Code' },
    ];
    // With allAgents provided, second agent gets #2
    expect(getAgentDisplayLabel(agents[0], null, agents)).toBe('Claude Code');
    expect(getAgentDisplayLabel(agents[1], null, agents)).toBe('Claude Code #2');
  });
});

describe('getIntentColor', () => {
  it('returns gray for null/empty', () => {
    expect(getIntentColor(null)).toBe('gray');
    expect(getIntentColor('')).toBe('gray');
  });

  it('returns yellow for idle', () => {
    expect(getIntentColor('Idle')).toBe('yellow');
  });

  it('returns red for error-like intents', () => {
    expect(getIntentColor('Error: connection failed')).toBe('red');
    expect(getIntentColor('Auth failed')).toBe('red');
    expect(getIntentColor('Blocked on merge conflict')).toBe('red');
  });

  it('returns cyan for normal work', () => {
    expect(getIntentColor('Refactoring auth flow')).toBe('cyan');
  });
});

describe('getAgentMeta', () => {
  it('returns null for null agent', () => {
    expect(getAgentMeta(null)).toBeNull();
  });

  it('includes origin, files, and update time', () => {
    const meta = getAgentMeta({
      _managed: true,
      _connected: true,
      activity: { files: ['src/auth.js'] },
      minutes_since_update: 5,
    });
    expect(meta).toContain('started here');
    expect(meta).toContain('auth.js');
    expect(meta).toContain('5m ago');
  });

  it('skips files and update time when not available', () => {
    const meta = getAgentMeta({
      _managed: false,
      activity: { files: [] },
    });
    expect(meta).toBe('joined automatically');
  });
});

describe('getRecentResultSummary', () => {
  it('returns tool state detail for failed agents', () => {
    expect(getRecentResultSummary({ _failed: true }, { detail: 'Auth token expired' })).toBe(
      'Auth token expired',
    );
  });

  it('returns output preview when available', () => {
    expect(getRecentResultSummary({ outputPreview: 'Done in 5s' }, null)).toBe('Done in 5s');
  });

  it('returns task as fallback', () => {
    expect(getRecentResultSummary({ task: 'Fix lint errors' }, null)).toBe('Fix lint errors');
  });

  it('returns failure/completion message as last resort', () => {
    expect(getRecentResultSummary({ _failed: true }, null)).toBe('Task failed');
    expect(getRecentResultSummary({}, null)).toBe('Task completed');
  });
});
