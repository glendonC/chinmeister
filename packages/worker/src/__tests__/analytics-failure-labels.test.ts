import { describe, it, expect } from 'vitest';

import {
  classifyTeamThrow,
  isTeamPayloadShapeOk,
} from '../routes/user/analytics/failure-labels.js';

// Per-team failure classification. The route's fan-out merger uses these
// helpers to attribute each per-team degradation to a structural label
// the dashboard can render. Without explicit coverage, a "rename one
// label string" diff would silently drop a category from observability
// without any visible failure.

describe('classifyTeamThrow', () => {
  it("labels the withTimeout rejection as 'timeout'", () => {
    const out = classifyTeamThrow(new Error('DO call timed out'));
    expect(out.error).toBe('timeout');
    expect(out.error_detail).toBe('DO call timed out');
  });

  it("labels an AbortError as 'timeout'", () => {
    // AbortError surfaces when the runtime aborts the request mid-flight
    // (network reset, client cancelled). Same structural cause as the
    // timeout: the team's data did not arrive in time. One label, one
    // bucket in the dashboard's failure tally.
    const err = new Error('aborted');
    err.name = 'AbortError';
    const out = classifyTeamThrow(err);
    expect(out.error).toBe('timeout');
  });

  it("labels any other throw as 'unhandled'", () => {
    const out = classifyTeamThrow(new Error('something else broke'));
    expect(out.error).toBe('unhandled');
    expect(out.error_detail).toBe('something else broke');
  });

  it('keeps the underlying message in error_detail for diagnostics', () => {
    // error_detail never reaches clients verbatim; the route uses it for
    // server-side logs. Pin the field so a log change cannot quietly drop
    // observability data.
    const out = classifyTeamThrow(new Error('disk full at row 17'));
    expect(out.error_detail).toBe('disk full at row 17');
  });
});

describe('isTeamPayloadShapeOk', () => {
  it('accepts a well-formed payload with a daily_trends array', () => {
    expect(isTeamPayloadShapeOk({ daily_trends: [], completion_summary: {} })).toBe(true);
  });

  it('accepts a payload that omits daily_trends entirely', () => {
    // Omission is fine: the merge step tolerates absence and treats it
    // as zero contribution. The shape gate only catches wildly-wrong
    // shapes (null, primitive, daily_trends-as-string).
    expect(isTeamPayloadShapeOk({ completion_summary: {} })).toBe(true);
  });

  it('rejects null', () => {
    expect(isTeamPayloadShapeOk(null)).toBe(false);
  });

  it('rejects a primitive', () => {
    expect(isTeamPayloadShapeOk('hello')).toBe(false);
    expect(isTeamPayloadShapeOk(42)).toBe(false);
    expect(isTeamPayloadShapeOk(undefined)).toBe(false);
  });

  it('rejects an object whose daily_trends is not an array', () => {
    expect(isTeamPayloadShapeOk({ daily_trends: 'no rows' })).toBe(false);
  });
});
