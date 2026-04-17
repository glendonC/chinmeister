import { describe, it, expect, vi } from 'vitest';
import { runCollectorsForProcess } from '../dashboard/hooks/useCollectorSubscription.js';

function makeProc(overrides = {}) {
  return {
    id: 1,
    toolId: 'claude-code',
    toolName: 'Claude Code',
    cmd: 'claude',
    args: [],
    taskArg: '',
    task: '',
    cwd: '/repo',
    agentId: 'agent-42',
    pty: null,
    status: 'exited',
    outputBuffer: [],
    startedAt: 1000,
    exitCode: 0,
    _lastNewline: true,
    _killTimer: null,
    teamId: null,
    sessionId: null,
    ...overrides,
  };
}

function completedRecord(overrides = {}) {
  return {
    agentId: 'agent-42',
    sessionId: 'sess_99',
    teamId: 't_team',
    toolId: 'claude-code',
    cwd: '/repo',
    startedAt: 500,
    completedAt: 2000,
    ...overrides,
  };
}

describe('runCollectorsForProcess', () => {
  it('invokes all three collectors with sessionId from completion record', async () => {
    const proc = makeProc();
    const config = { token: 'tok', team_id: null, handle: null, homeDir: null, localDev: false };

    const collectConversation = vi.fn().mockResolvedValue(undefined);
    const collectTokenUsage = vi.fn().mockResolvedValue(undefined);
    const collectToolCalls = vi.fn().mockResolvedValue(undefined);
    const deleteCompletedSession = vi.fn();
    const record = completedRecord();

    await runCollectorsForProcess(proc, config, {
      readCompletedSessionFn: vi.fn().mockReturnValue(record),
      deleteCompletedSessionFn: deleteCompletedSession,
      collectConversationFn: collectConversation,
      collectTokenUsageFn: collectTokenUsage,
      collectToolCallsFn: collectToolCalls,
    });

    for (const fn of [collectConversation, collectTokenUsage, collectToolCalls]) {
      expect(fn).toHaveBeenCalledTimes(1);
      const [, cfg, teamId, sessionId] = fn.mock.calls[0];
      expect(cfg).toBe(config);
      expect(teamId).toBe('t_team');
      expect(sessionId).toBe('sess_99');
    }
    expect(deleteCompletedSession).toHaveBeenCalledWith('agent-42');
  });

  it('skips silently when no completion file is found after polling', async () => {
    const proc = makeProc();
    const config = { token: 'tok', team_id: null, handle: null, homeDir: null, localDev: false };

    const collectConversation = vi.fn().mockResolvedValue(undefined);
    const collectTokenUsage = vi.fn().mockResolvedValue(undefined);
    const collectToolCalls = vi.fn().mockResolvedValue(undefined);
    const deleteCompletedSession = vi.fn();

    await runCollectorsForProcess(proc, config, {
      readCompletedSessionFn: vi.fn().mockReturnValue(null),
      deleteCompletedSessionFn: deleteCompletedSession,
      collectConversationFn: collectConversation,
      collectTokenUsageFn: collectTokenUsage,
      collectToolCallsFn: collectToolCalls,
      pollDelaysMs: [0],
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(collectConversation).not.toHaveBeenCalled();
    expect(collectTokenUsage).not.toHaveBeenCalled();
    expect(collectToolCalls).not.toHaveBeenCalled();
    expect(deleteCompletedSession).not.toHaveBeenCalled();
  });

  it('returns without calling anything when process has no agentId', async () => {
    const proc = makeProc({ agentId: null });
    const config = { token: 'tok', team_id: null, handle: null, homeDir: null, localDev: false };

    const readFn = vi.fn();
    const collectConversation = vi.fn();

    await runCollectorsForProcess(proc, config, {
      readCompletedSessionFn: readFn,
      collectConversationFn: collectConversation,
      pollDelaysMs: [0],
    });

    expect(readFn).not.toHaveBeenCalled();
    expect(collectConversation).not.toHaveBeenCalled();
  });

  it('polls with configured delays until completion record appears', async () => {
    const proc = makeProc();
    const config = { token: 'tok', team_id: null, handle: null, homeDir: null, localDev: false };

    let callCount = 0;
    const readFn = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount >= 3 ? completedRecord() : null;
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await runCollectorsForProcess(proc, config, {
      readCompletedSessionFn: readFn,
      deleteCompletedSessionFn: vi.fn(),
      collectConversationFn: vi.fn().mockResolvedValue(undefined),
      collectTokenUsageFn: vi.fn().mockResolvedValue(undefined),
      collectToolCallsFn: vi.fn().mockResolvedValue(undefined),
      pollDelaysMs: [0, 100, 500],
      sleep,
    });

    expect(readFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 500);
  });

  it('swallows collector errors and still deletes the completion record', async () => {
    const proc = makeProc();
    const config = { token: 'tok', team_id: null, handle: null, homeDir: null, localDev: false };

    const deleteCompletedSession = vi.fn();
    const collectConversation = vi.fn().mockRejectedValue(new Error('network down'));
    const collectTokenUsage = vi.fn().mockResolvedValue(undefined);
    const collectToolCalls = vi.fn().mockResolvedValue(undefined);

    await runCollectorsForProcess(proc, config, {
      readCompletedSessionFn: vi.fn().mockReturnValue(completedRecord()),
      deleteCompletedSessionFn: deleteCompletedSession,
      collectConversationFn: collectConversation,
      collectTokenUsageFn: collectTokenUsage,
      collectToolCallsFn: collectToolCalls,
    });

    expect(deleteCompletedSession).toHaveBeenCalledWith('agent-42');
  });
});
