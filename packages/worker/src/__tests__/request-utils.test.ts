import { describe, it, expect, vi } from 'vitest';

// Mock cloudflare:workers so DO class imports resolve outside the Workers runtime
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

import {
  teamErrorStatus,
  getAgentRuntime,
  parseTeamPath,
  getAgentId,
  getToolFromAgentId,
  sanitizeTags,
} from '../lib/request-utils.js';

// --- teamErrorStatus ---

describe('teamErrorStatus', () => {
  it('returns 403 for NOT_MEMBER code', () => {
    expect(teamErrorStatus({ error: 'Not a member', code: 'NOT_MEMBER' })).toBe(403);
  });

  it('returns 403 for NOT_OWNER code', () => {
    expect(teamErrorStatus({ error: 'Not your agent', code: 'NOT_OWNER' })).toBe(403);
  });

  it('returns 403 for FORBIDDEN code', () => {
    expect(teamErrorStatus({ error: 'Access denied', code: 'FORBIDDEN' })).toBe(403);
  });

  it('returns 404 for NOT_FOUND code', () => {
    expect(teamErrorStatus({ error: 'Memory not found', code: 'NOT_FOUND' })).toBe(404);
  });

  it('returns 409 for CONFLICT code', () => {
    expect(teamErrorStatus({ error: 'Handle taken', code: 'CONFLICT' })).toBe(409);
  });

  it('returns 409 for AGENT_CLAIMED code', () => {
    expect(teamErrorStatus({ error: 'Already claimed', code: 'AGENT_CLAIMED' })).toBe(409);
  });

  it('returns 500 for INTERNAL code', () => {
    expect(teamErrorStatus({ error: 'Internal error', code: 'INTERNAL' })).toBe(500);
  });

  it('returns 400 for unknown codes', () => {
    expect(teamErrorStatus({ error: 'Something', code: 'UNKNOWN_CODE' })).toBe(400);
  });

  it('returns 400 for VALIDATION code (falls through to default)', () => {
    expect(teamErrorStatus({ error: 'Bad input', code: 'VALIDATION' })).toBe(400);
  });

  it('returns 400 for objects without error code', () => {
    expect(teamErrorStatus({ error: 'Invalid input' })).toBe(400);
  });

  it('returns 400 for null or undefined', () => {
    expect(teamErrorStatus(null as any)).toBe(400);
    expect(teamErrorStatus(undefined as any)).toBe(400);
  });

  it('returns 400 for non-object input', () => {
    expect(teamErrorStatus('string' as any)).toBe(400);
    expect(teamErrorStatus(42 as any)).toBe(400);
  });
});

// --- getAgentRuntime ---

describe('getAgentRuntime', () => {
  const user = { id: 'user-1' } as any;

  it('extracts all runtime headers when present', () => {
    const request = new Request('http://example.com', {
      headers: {
        'X-Agent-Id': 'cursor:abc123',
        'X-Agent-Host-Tool': 'vscode',
        'X-Agent-Surface': 'cline',
        'X-Agent-Transport': 'mcp',
        'X-Agent-Tier': 'connected',
      },
    });

    expect(getAgentRuntime(request, user)).toEqual({
      agentId: 'cursor:abc123',
      hostTool: 'vscode',
      agentSurface: 'cline',
      transport: 'mcp',
      tier: 'connected',
    });
  });

  it('falls back to agent ID prefix for hostTool when header is absent', () => {
    const request = new Request('http://example.com', {
      headers: { 'X-Agent-Id': 'windsurf:def456' },
    });

    const result = getAgentRuntime(request, user);
    expect(result.agentId).toBe('windsurf:def456');
    expect(result.hostTool).toBe('windsurf');
    expect(result.agentSurface).toBeNull();
    expect(result.transport).toBeNull();
    expect(result.tier).toBeNull();
  });

  it('falls back to user.id when no X-Agent-Id header', () => {
    const request = new Request('http://example.com');
    const result = getAgentRuntime(request, user);
    expect(result.agentId).toBe('user-1');
    expect(result.hostTool).toBe('unknown');
  });

  it('rejects agent IDs that fail pattern validation', () => {
    const request = new Request('http://example.com', {
      headers: { 'X-Agent-Id': 'invalid agent id with spaces!' },
    });
    const result = getAgentRuntime(request, user);
    expect(result.agentId).toBe('user-1'); // falls back
  });

  it('rejects runtime header values exceeding max length', () => {
    const request = new Request('http://example.com', {
      headers: {
        'X-Agent-Id': 'cursor:abc123',
        'X-Agent-Host-Tool': 'a'.repeat(51), // exceeds default maxLength of 50
      },
    });
    const result = getAgentRuntime(request, user);
    expect(result.hostTool).toBe('cursor'); // falls back to ID prefix
  });

  it('rejects runtime headers with invalid characters', () => {
    const request = new Request('http://example.com', {
      headers: {
        'X-Agent-Id': 'cursor:abc123',
        'X-Agent-Surface': 'has spaces!',
      },
    });
    const result = getAgentRuntime(request, user);
    expect(result.agentSurface).toBeNull();
  });
});

// --- getAgentId ---

describe('getAgentId', () => {
  const user = { id: 'user-1' } as any;

  it('returns agent ID from header when valid', () => {
    const request = new Request('http://example.com', {
      headers: { 'X-Agent-Id': 'claude:session-xyz' },
    });
    expect(getAgentId(request, user)).toBe('claude:session-xyz');
  });

  it('falls back to user.id when header is absent', () => {
    const request = new Request('http://example.com');
    expect(getAgentId(request, user)).toBe('user-1');
  });

  it('falls back to user.id for overly long agent IDs', () => {
    const request = new Request('http://example.com', {
      headers: { 'X-Agent-Id': 'a'.repeat(61) }, // exceeds 60 char limit
    });
    expect(getAgentId(request, user)).toBe('user-1');
  });

  it('accepts dots, colons, hyphens, underscores in agent ID', () => {
    const request = new Request('http://example.com', {
      headers: { 'X-Agent-Id': 'tool:session.abc_123-xyz' },
    });
    expect(getAgentId(request, user)).toBe('tool:session.abc_123-xyz');
  });
});

// --- getToolFromAgentId ---

describe('getToolFromAgentId', () => {
  it('extracts tool name from colon-separated agent ID', () => {
    expect(getToolFromAgentId('cursor:abc123')).toBe('cursor');
  });

  it('extracts tool for various prefixes', () => {
    expect(getToolFromAgentId('claude:session-xyz')).toBe('claude');
    expect(getToolFromAgentId('aider:12345')).toBe('aider');
    expect(getToolFromAgentId('windsurf:a1b2c3')).toBe('windsurf');
  });

  it('returns "unknown" for string without colon', () => {
    expect(getToolFromAgentId('justanid')).toBe('unknown');
  });

  it('returns "unknown" for colon at start', () => {
    expect(getToolFromAgentId(':abc123')).toBe('unknown');
  });

  it('handles multiple colons (takes up to first)', () => {
    expect(getToolFromAgentId('tool:sub:value')).toBe('tool');
  });

  it('returns "unknown" for empty string', () => {
    expect(getToolFromAgentId('')).toBe('unknown');
  });
});

// --- parseTeamPath ---

describe('parseTeamPath', () => {
  it('parses a valid team path with action', () => {
    const result = parseTeamPath('/teams/t_a7b3c9d2e1f04856/context');
    expect(result).toEqual({ teamId: 't_a7b3c9d2e1f04856', action: 'context' });
  });

  it('parses different valid actions', () => {
    expect(parseTeamPath('/teams/t_0000000000000000/join')).toEqual({
      teamId: 't_0000000000000000',
      action: 'join',
    });
    expect(parseTeamPath('/teams/t_ffffffffffffffff/heartbeat')).toEqual({
      teamId: 't_ffffffffffffffff',
      action: 'heartbeat',
    });
  });

  it('returns null for missing /teams prefix', () => {
    expect(parseTeamPath('/team/t_a7b3c9d2e1f04856/context')).toBeNull();
  });

  it('returns null for wrong team ID format (too short)', () => {
    expect(parseTeamPath('/teams/t_a7b3c9d2/context')).toBeNull();
  });

  it('returns null for wrong team ID format (too long)', () => {
    expect(parseTeamPath('/teams/t_a7b3c9d2e1f04856aa/context')).toBeNull();
  });

  it('returns null for missing t_ prefix on team ID', () => {
    expect(parseTeamPath('/teams/a7b3c9d2e1f04856/context')).toBeNull();
  });

  it('returns null for uppercase hex in team ID', () => {
    expect(parseTeamPath('/teams/t_A7B3C9D2E1F04856/context')).toBeNull();
  });

  it('returns null for missing action', () => {
    expect(parseTeamPath('/teams/t_a7b3c9d2e1f04856')).toBeNull();
    expect(parseTeamPath('/teams/t_a7b3c9d2e1f04856/')).toBeNull();
  });

  it('returns null for extra path segments', () => {
    expect(parseTeamPath('/teams/t_a7b3c9d2e1f04856/context/extra')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTeamPath('')).toBeNull();
  });

  it('returns null for action with uppercase letters', () => {
    expect(parseTeamPath('/teams/t_a7b3c9d2e1f04856/Context')).toBeNull();
  });

  it('returns null for action with numbers', () => {
    expect(parseTeamPath('/teams/t_a7b3c9d2e1f04856/test123')).toBeNull();
  });
});

// --- sanitizeTags ---

describe('sanitizeTags', () => {
  it('returns cleaned tags from valid string array', () => {
    expect(sanitizeTags(['JavaScript', 'TypeScript'])).toEqual(['javascript', 'typescript']);
  });

  it('filters out non-string values', () => {
    expect(sanitizeTags([42, null, undefined, true, 'valid'])).toEqual(['valid']);
  });

  it('caps individual tag length at 50 characters', () => {
    const result = sanitizeTags(['a'.repeat(100)]);
    expect(result[0]).toHaveLength(50);
  });

  it('lowercases all tags', () => {
    expect(sanitizeTags(['UPPER', 'MiXeD', 'lower'])).toEqual(['upper', 'mixed', 'lower']);
  });

  it('caps array length at 50', () => {
    const tags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
    expect(sanitizeTags(tags)).toHaveLength(50);
  });

  it('returns empty array for non-array input', () => {
    expect(sanitizeTags(null)).toEqual([]);
    expect(sanitizeTags(undefined)).toEqual([]);
    expect(sanitizeTags('string')).toEqual([]);
    expect(sanitizeTags(42)).toEqual([]);
    expect(sanitizeTags({})).toEqual([]);
  });

  it('trims whitespace from tags', () => {
    expect(sanitizeTags(['  padded  ', ' left', 'right '])).toEqual(['padded', 'left', 'right']);
  });

  it('filters out tags that become empty after trimming', () => {
    expect(sanitizeTags(['   ', '', 'valid'])).toEqual(['valid']);
  });
});
