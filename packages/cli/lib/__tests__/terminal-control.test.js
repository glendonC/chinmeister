import { describe, it, expect, afterEach } from 'vitest';
import { getTerminalUiCapabilities } from '../terminal-control.js';

describe('getTerminalUiCapabilities', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns an object with expected properties', () => {
    const caps = getTerminalUiCapabilities();
    expect(caps).toHaveProperty('hasBasicColor');
    expect(caps).toHaveProperty('hasBackgroundFill');
    expect(caps).toHaveProperty('isLowFidelity');
    expect(typeof caps.hasBasicColor).toBe('boolean');
    expect(typeof caps.hasBackgroundFill).toBe('boolean');
    expect(typeof caps.isLowFidelity).toBe('boolean');
  });

  it('disables color when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    delete process.env.FORCE_COLOR;
    const caps = getTerminalUiCapabilities();
    // With NO_COLOR set and no FORCE_COLOR, colors should be disabled
    // unless FORCE_COLOR is also set
    expect(caps.hasBasicColor).toBe(false);
    expect(caps.isLowFidelity).toBe(true);
  });

  it('forces color when FORCE_COLOR is set', () => {
    process.env.FORCE_COLOR = '1';
    delete process.env.NO_COLOR;
    const caps = getTerminalUiCapabilities();
    expect(caps.hasBasicColor).toBe(true);
    expect(caps.hasBackgroundFill).toBe(true);
    expect(caps.isLowFidelity).toBe(false);
  });

  it('isLowFidelity is inverse of hasBasicColor', () => {
    const caps = getTerminalUiCapabilities();
    expect(caps.isLowFidelity).toBe(!caps.hasBasicColor);
  });
});
