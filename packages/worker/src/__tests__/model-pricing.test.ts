import { describe, it, expect, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

import { estimateSessionCost } from '../lib/model-pricing.js';
import type { NormalizedModelPrice } from '../lib/litellm-transform.js';

// A Claude Sonnet 4.5 style row with all fields populated. Used as the
// baseline; individual tests override specific fields to exercise each
// branch of the cost function.
const FULL_ROW: NormalizedModelPrice = {
  canonical_name: 'claude-sonnet-4-5-20250929',
  input_per_1m: 3,
  output_per_1m: 15,
  cache_creation_per_1m: 3.75,
  cache_read_per_1m: 0.3,
  input_per_1m_above_200k: 6,
  output_per_1m_above_200k: 22.5,
  max_input_tokens: 200000,
  max_output_tokens: 64000,
  raw: null,
};

// A gpt-4 style row: no cache pricing, no long-context tier.
const BARE_ROW: NormalizedModelPrice = {
  canonical_name: 'gpt-4',
  input_per_1m: 30,
  output_per_1m: 60,
  cache_creation_per_1m: null,
  cache_read_per_1m: null,
  input_per_1m_above_200k: null,
  output_per_1m_above_200k: null,
  max_input_tokens: null,
  max_output_tokens: null,
  raw: null,
};

describe('estimateSessionCost', () => {
  // --- Null on missing row ---

  it('returns null when row is null', () => {
    expect(
      estimateSessionCost(null, {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBeNull();
  });

  it('returns null when row is undefined', () => {
    expect(
      estimateSessionCost(undefined, {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBeNull();
  });

  // --- Basic four-token math (below long-context threshold) ---

  it('computes cost with all four token types at base rates (below 200K threshold)', () => {
    // 10K of each token type (total input volume = 30K, under the 200K
    // long-context threshold, so base rates apply).
    //   10K × $3/M    = 0.03
    //   10K × $15/M   = 0.15
    //   10K × $0.30/M = 0.003
    //   10K × $3.75/M = 0.0375
    //   total = 0.2205
    const cost = estimateSessionCost(FULL_ROW, {
      inputTokens: 10_000,
      outputTokens: 10_000,
      cacheReadTokens: 10_000,
      cacheCreationTokens: 10_000,
    });
    expect(cost).toBeCloseTo(0.2205, 5);
  });

  it('handles zero tokens across the board', () => {
    const cost = estimateSessionCost(FULL_ROW, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBe(0);
  });

  it('computes realistic heavy-cache Claude Code session', () => {
    // Approximating a ~20-turn Sonnet 4.5 session with a cached prefix:
    //   60K uncached input @ $3/M  = 0.18
    //   70K output @ $15/M        = 1.05
    //   760K cache_read @ $0.30/M = 0.228
    //   80K cache_creation @ $3.75/M = 0.30
    //   total ≈ $1.758
    // (Total input volume = 60 + 760 + 80 = 900K, which is over 200K, so
    // the above_200k tier kicks in for input/output. See next test for
    // the non-tier version.)
    const cost = estimateSessionCost(
      { ...FULL_ROW, input_per_1m_above_200k: null, output_per_1m_above_200k: null },
      {
        inputTokens: 60_000,
        outputTokens: 70_000,
        cacheReadTokens: 760_000,
        cacheCreationTokens: 80_000,
      },
    );
    expect(cost).toBeCloseTo(1.758, 3);
  });

  // --- above_200k tier selection ---

  it('uses above_200k input rate when total input volume exceeds 200K', () => {
    // Total input volume = 60K + 760K + 80K = 900K > 200K
    // Input rate becomes $6/M, output rate becomes $22.5/M
    //   60K @ $6/M   = 0.36
    //   70K @ $22.5/M = 1.575
    //   760K @ $0.30/M = 0.228 (cache rates DO NOT switch to above_200k)
    //   80K @ $3.75/M = 0.30
    //   total = 2.463
    const cost = estimateSessionCost(FULL_ROW, {
      inputTokens: 60_000,
      outputTokens: 70_000,
      cacheReadTokens: 760_000,
      cacheCreationTokens: 80_000,
    });
    expect(cost).toBeCloseTo(2.463, 3);
  });

  it('stays on base rate when total input is under 200K', () => {
    const cost = estimateSessionCost(FULL_ROW, {
      inputTokens: 50_000,
      outputTokens: 10_000,
      cacheReadTokens: 100_000,
      cacheCreationTokens: 10_000,
    });
    // Total input = 50 + 100 + 10 = 160K, under threshold
    //   50K @ $3   = 0.15
    //   10K @ $15  = 0.15
    //   100K @ $0.30 = 0.03
    //   10K @ $3.75 = 0.0375
    //   total = 0.3675
    expect(cost).toBeCloseTo(0.3675, 4);
  });

  it('does not use above_200k tier when input_per_1m_above_200k is null', () => {
    const rowWithoutTier: NormalizedModelPrice = {
      ...FULL_ROW,
      input_per_1m_above_200k: null,
      output_per_1m_above_200k: null,
    };
    // 300K total input but no above_200k rate → falls back to base
    const cost = estimateSessionCost(rowWithoutTier, {
      inputTokens: 100_000,
      outputTokens: 50_000,
      cacheReadTokens: 200_000,
      cacheCreationTokens: 0,
    });
    // 100K @ $3 + 50K @ $15 + 200K @ $0.30 = 0.3 + 0.75 + 0.06 = 1.11
    expect(cost).toBeCloseTo(1.11, 3);
  });

  it('falls back to base output rate when above_200k_output is null but above_200k_input is set', () => {
    const rowPartialTier: NormalizedModelPrice = {
      ...FULL_ROW,
      output_per_1m_above_200k: null,
    };
    const cost = estimateSessionCost(rowPartialTier, {
      inputTokens: 300_000,
      outputTokens: 100_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    // Input tiered at $6, output at base $15 (since above_200k_output is null)
    // 300K @ $6 + 100K @ $15 = 1.8 + 1.5 = 3.3
    expect(cost).toBeCloseTo(3.3, 3);
  });

  // --- Cache ratio fallback ---

  it('falls back to ratio pricing when cache rates are null', () => {
    // gpt-4 style: no cache fields. Caller provides cache tokens anyway.
    // Ratio fallback: cache_write = 1.25 × input, cache_read = 0.1 × input
    const cost = estimateSessionCost(BARE_ROW, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    });
    // input: 1M @ $30 = 30
    // output: 1M @ $60 = 60
    // cache_read fallback: 1M @ ($30 × 0.1) = $3
    // cache_creation fallback: 1M @ ($30 × 1.25) = $37.5
    // total = 30 + 60 + 3 + 37.5 = 130.5
    expect(cost).toBeCloseTo(130.5, 3);
  });

  it('uses base input rate (not above_200k) as anchor for ratio fallback', () => {
    // Even at >200K total volume, the ratio fallback uses base input rate
    // because LiteLLM never exposes cache pricing tiered on prompt length.
    const rowWithTierButNoCache: NormalizedModelPrice = {
      ...FULL_ROW,
      cache_creation_per_1m: null,
      cache_read_per_1m: null,
    };
    const cost = estimateSessionCost(rowWithTierButNoCache, {
      inputTokens: 100_000,
      outputTokens: 0,
      cacheReadTokens: 200_000,
      cacheCreationTokens: 0,
    });
    // Total input = 300K > 200K, tier ON for input/output.
    // Input: 100K @ $6 = 0.6
    // Output: 0 @ $22.5 = 0
    // Cache read fallback: 200K @ ($3 × 0.1 = $0.30) = 0.06
    //   (using base $3, NOT the above_200k $6)
    expect(cost).toBeCloseTo(0.66, 3);
  });

  // --- Defensive NaN handling ---

  it('returns null if cost computation produces NaN', () => {
    // Crafted malformed row: Infinity rate would propagate to Infinity cost.
    // Number.isFinite guard should catch this.
    const malformedRow: NormalizedModelPrice = {
      ...BARE_ROW,
      input_per_1m: Number.POSITIVE_INFINITY,
    };
    const cost = estimateSessionCost(malformedRow, {
      inputTokens: 1_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBeNull();
  });
});
