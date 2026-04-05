import { describe, it, expect } from 'vitest';
import { parseArgs } from '../commands/run.js';

describe('parseArgs', () => {
  it('extracts task from positional args', () => {
    const result = parseArgs(['fix', 'the', 'bug']);
    expect(result.task).toBe('fix the bug');
    expect(result.toolId).toBeNull();
  });

  it('extracts --tool flag', () => {
    const result = parseArgs(['--tool', 'claude-code', 'do something']);
    expect(result.toolId).toBe('claude-code');
    expect(result.task).toBe('do something');
  });

  it('handles --tool at end of args', () => {
    const result = parseArgs(['task here', '--tool', 'cursor']);
    expect(result.toolId).toBe('cursor');
    expect(result.task).toBe('task here');
  });

  it('returns null toolId when --tool has no value', () => {
    const result = parseArgs(['--tool']);
    expect(result.toolId).toBeNull();
    expect(result.task).toBe('');
  });

  it('returns empty task for empty argv', () => {
    const result = parseArgs([]);
    expect(result.task).toBe('');
    expect(result.toolId).toBeNull();
  });

  it('trims whitespace from task', () => {
    const result = parseArgs(['  hello  ']);
    expect(result.task).toBe('hello');
  });

  it('joins multiple positional args with spaces', () => {
    const result = parseArgs(['write', 'tests', 'for', 'everything']);
    expect(result.task).toBe('write tests for everything');
  });

  it('handles --tool between task words', () => {
    const result = parseArgs(['fix', '--tool', 'aider', 'the bug']);
    expect(result.toolId).toBe('aider');
    expect(result.task).toBe('fix the bug');
  });
});
