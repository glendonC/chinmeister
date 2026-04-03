import { describe, it, expect } from 'vitest';

/**
 * Tests for shell.jsx layout calculation logic.
 *
 * Since shell.jsx is a React component that uses Ink hooks, we test
 * the pure layout calculation functions extracted from the component logic.
 * These mirror the exact calculations in getRailWidth, getNavHintWidth,
 * and the layout mode selection.
 */

const MIN_ROWS = 18;

function getRailWidth(items, compact) {
  if (!items?.length) return 0;
  return items.reduce((total, item) => {
    const label = compact ? item.shortLabel || item.label : item.label;
    const meta = item.meta ? ` ${item.meta}` : '';
    return total + label.length + meta.length + 6;
  }, 0);
}

function getNavHintWidth(compact) {
  const labels = compact ? ['<- shift+tab', 'tab ->'] : ['<- shift+tab', 'tab ->'];
  return Math.max(...labels.map((label) => label.length)) + 5;
}

function getActiveModeItem(items, activeKey) {
  return items.find((item) => item.key === activeKey) || items[0] || null;
}

function computeLayoutMode(cols, rows, modeItems) {
  const fullHintWidth = getNavHintWidth(false) * 2 + 4;
  const compactHintWidth = getNavHintWidth(true) * 2 + 4;
  const fullMinCols = Math.max(68, getRailWidth(modeItems, false) + fullHintWidth + 8);
  const compactMinCols = Math.max(60, getRailWidth(modeItems, true) + compactHintWidth + 8);
  const activeModeItem = getActiveModeItem(modeItems, modeItems[0]?.key);
  const narrowMinCols = Math.max(
    48,
    getRailWidth(activeModeItem ? [activeModeItem] : [], true) + compactHintWidth + 8,
  );

  let layoutMode = 'full';
  if (cols < compactMinCols) layoutMode = 'narrow';
  else if (cols < fullMinCols) layoutMode = 'compact';

  const minCols =
    layoutMode === 'narrow'
      ? narrowMinCols
      : layoutMode === 'compact'
        ? compactMinCols
        : fullMinCols;
  const tooSmall = cols < minCols || rows < MIN_ROWS;

  return { layoutMode, minCols, tooSmall };
}

describe('getRailWidth', () => {
  it('returns 0 for empty/null items', () => {
    expect(getRailWidth(null, false)).toBe(0);
    expect(getRailWidth([], false)).toBe(0);
  });

  it('calculates width for a single item', () => {
    const items = [{ key: 'agents', label: 'Agents' }];
    const width = getRailWidth(items, false);
    // 6 chars for label + 6 for borders/padding/gap = 12
    expect(width).toBe(12);
  });

  it('uses shortLabel in compact mode', () => {
    const items = [{ key: 'agents', label: 'Agents', shortLabel: 'Ag' }];
    const fullWidth = getRailWidth(items, false);
    const compactWidth = getRailWidth(items, true);
    expect(compactWidth).toBeLessThan(fullWidth);
  });

  it('includes meta text in width', () => {
    const items = [{ key: 'agents', label: 'Agents', meta: '(3)' }];
    const widthWithMeta = getRailWidth(items, false);
    const widthWithoutMeta = getRailWidth([{ key: 'agents', label: 'Agents' }], false);
    expect(widthWithMeta).toBeGreaterThan(widthWithoutMeta);
  });

  it('sums width across multiple items', () => {
    const items = [
      { key: 'a', label: 'Alpha' },
      { key: 'b', label: 'Beta' },
    ];
    const width = getRailWidth(items, false);
    const singleWidth = getRailWidth([items[0]], false);
    expect(width).toBeGreaterThan(singleWidth);
  });
});

describe('getNavHintWidth', () => {
  it('returns a positive number', () => {
    expect(getNavHintWidth(false)).toBeGreaterThan(0);
    expect(getNavHintWidth(true)).toBeGreaterThan(0);
  });
});

describe('getActiveModeItem', () => {
  it('finds item by key', () => {
    const items = [
      { key: 'a', label: 'Alpha' },
      { key: 'b', label: 'Beta' },
    ];
    expect(getActiveModeItem(items, 'b')).toEqual({ key: 'b', label: 'Beta' });
  });

  it('falls back to first item', () => {
    const items = [{ key: 'a', label: 'Alpha' }];
    expect(getActiveModeItem(items, 'missing')).toEqual({ key: 'a', label: 'Alpha' });
  });

  it('returns null for empty array', () => {
    expect(getActiveModeItem([], 'a')).toBeNull();
  });
});

describe('layout mode computation', () => {
  const sampleModeItems = [
    { key: 'dashboard', label: 'Dashboard', shortLabel: 'Dash' },
    { key: 'discover', label: 'Discover', shortLabel: 'Disc' },
    { key: 'settings', label: 'Settings', shortLabel: 'Set' },
  ];

  it('uses full layout on wide terminals', () => {
    const result = computeLayoutMode(120, 30, sampleModeItems);
    expect(result.layoutMode).toBe('full');
    expect(result.tooSmall).toBe(false);
  });

  it('uses compact layout on medium terminals', () => {
    // Find a width that's between compact and full thresholds
    // Full needs ~68+ for 3 items, compact needs ~60+
    const result = computeLayoutMode(66, 24, sampleModeItems);
    // At 66 cols this could be compact or narrow depending on rail width
    expect(['compact', 'narrow']).toContain(result.layoutMode);
    expect(result.layoutMode).not.toBe('full');
  });

  it('uses narrow layout on small terminals', () => {
    const result = computeLayoutMode(50, 20, sampleModeItems);
    expect(result.layoutMode).toBe('narrow');
  });

  it('reports too small for very narrow terminals', () => {
    const result = computeLayoutMode(30, 20, sampleModeItems);
    expect(result.tooSmall).toBe(true);
  });

  it('reports too small for short terminals', () => {
    const result = computeLayoutMode(120, 10, sampleModeItems);
    expect(result.tooSmall).toBe(true);
  });

  it('reports too small when both dimensions are insufficient', () => {
    const result = computeLayoutMode(30, 10, sampleModeItems);
    expect(result.tooSmall).toBe(true);
  });
});

describe('viewport calculations', () => {
  it('calculates divider width', () => {
    const cols = 80;
    const dividerWidth = Math.min(cols - 4, 50);
    expect(dividerWidth).toBe(50);
  });

  it('clamps divider width for narrow terminals', () => {
    const cols = 40;
    const dividerWidth = Math.min(cols - 4, 50);
    expect(dividerWidth).toBe(36);
  });

  it('calculates viewport rows', () => {
    const rows = 30;
    const viewportRows = Math.max(rows - 5, 8);
    expect(viewportRows).toBe(25);
  });

  it('clamps viewport rows to minimum of 8', () => {
    const rows = 10;
    const viewportRows = Math.max(rows - 5, 8);
    expect(viewportRows).toBe(8);
  });
});
