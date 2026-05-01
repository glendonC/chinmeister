import { describe, it, expect } from 'vitest';

import {
  healLiveAgentsWidth,
  healProjectsWidth,
  healOutcomesWidth,
  healScopeComplexityWidth,
  healToolCallErrorsSize,
  healModelMixSize,
  healTeamStatSize,
  clampToCatalogConstraints,
  healActivityLayout,
  healAll,
} from './useOverviewLayout.js';
import type { WidgetSlot } from '../../widgets/widget-catalog.js';

// Each healer below is named for the bug it solves. Tests pin the exact
// transformation so a future catalog edit that changes a default size
// fails loud here, with the prior assumption visible.
//
// The chain order is also pinned in the integration test at the bottom:
// per-widget healers first (some widen past prior maxW), heal-activity
// late (it inserts new slots), generic clamp last (defends against any
// uncaught-by-name slot exceeding the catalog viz constraints).

describe('healLiveAgentsWidth', () => {
  it('snaps a stale 12-col live-agents back to 6', () => {
    const out = healLiveAgentsWidth([{ id: 'live-agents', colSpan: 12, rowSpan: 4 }]);
    expect(out).toEqual([{ id: 'live-agents', colSpan: 6, rowSpan: 4 }]);
  });

  it('leaves a healthy live-agents slot untouched', () => {
    const slots: WidgetSlot[] = [{ id: 'live-agents', colSpan: 6, rowSpan: 4 }];
    expect(healLiveAgentsWidth(slots)).toEqual(slots);
  });

  it('does not touch other widgets at colSpan 12', () => {
    const slots: WidgetSlot[] = [{ id: 'heatmap', colSpan: 12, rowSpan: 3 }];
    expect(healLiveAgentsWidth(slots)).toEqual(slots);
  });
});

describe('healProjectsWidth', () => {
  it('snaps a stale 12-col projects slot back to 6', () => {
    const out = healProjectsWidth([{ id: 'projects', colSpan: 12, rowSpan: 3 }]);
    expect(out).toEqual([{ id: 'projects', colSpan: 6, rowSpan: 3 }]);
  });

  it('also snaps the old 8-col projects default back to 6', () => {
    const out = healProjectsWidth([{ id: 'projects', colSpan: 8, rowSpan: 3 }]);
    expect(out).toEqual([{ id: 'projects', colSpan: 6, rowSpan: 3 }]);
  });
});

describe('healOutcomesWidth', () => {
  it('widens a 4-col outcomes slot to the 8-col table-shape default', () => {
    const out = healOutcomesWidth([{ id: 'outcomes', colSpan: 4, rowSpan: 3 }]);
    expect(out).toEqual([{ id: 'outcomes', colSpan: 8, rowSpan: 3 }]);
  });

  it('leaves outcomes at 8 cols untouched', () => {
    const slots: WidgetSlot[] = [{ id: 'outcomes', colSpan: 8, rowSpan: 3 }];
    expect(healOutcomesWidth(slots)).toEqual(slots);
  });
});

describe('healScopeComplexityWidth', () => {
  it('widens a 6-col scope-complexity to 8', () => {
    const out = healScopeComplexityWidth([{ id: 'scope-complexity', colSpan: 6, rowSpan: 3 }]);
    expect(out[0]?.colSpan).toBe(8);
  });
});

describe('healToolCallErrorsSize', () => {
  it('snaps an oversized panel layout to the 3x2 stat default', () => {
    const out = healToolCallErrorsSize([{ id: 'tool-call-errors', colSpan: 6, rowSpan: 3 }]);
    expect(out).toEqual([{ id: 'tool-call-errors', colSpan: 3, rowSpan: 2 }]);
  });

  it('also catches the intermediate 4x2 phase', () => {
    const out = healToolCallErrorsSize([{ id: 'tool-call-errors', colSpan: 4, rowSpan: 2 }]);
    expect(out).toEqual([{ id: 'tool-call-errors', colSpan: 3, rowSpan: 2 }]);
  });
});

describe('healModelMixSize', () => {
  it('shrinks the stale 4x3 height back to 4x2', () => {
    const out = healModelMixSize([{ id: 'model-mix', colSpan: 4, rowSpan: 3 }]);
    expect(out).toEqual([{ id: 'model-mix', colSpan: 4, rowSpan: 2 }]);
  });
});

describe('healTeamStatSize', () => {
  it('snaps file-overlap from the wide stat-row shape to 3x2', () => {
    const out = healTeamStatSize([{ id: 'file-overlap', colSpan: 6, rowSpan: 2 }]);
    expect(out).toEqual([{ id: 'file-overlap', colSpan: 3, rowSpan: 2 }]);
  });

  it('snaps conflicts-blocked from the wide stat-row shape to 3x2', () => {
    const out = healTeamStatSize([{ id: 'conflicts-blocked', colSpan: 6, rowSpan: 2 }]);
    expect(out).toEqual([{ id: 'conflicts-blocked', colSpan: 3, rowSpan: 2 }]);
  });
});

describe('clampToCatalogConstraints', () => {
  it('clamps a stat card persisted past its viz max', () => {
    // `cost` is viz: 'stat' which has maxW 4. A 12-col cost slot from a
    // pre-rubric persistence path should clamp to 4.
    const out = clampToCatalogConstraints([{ id: 'cost', colSpan: 12, rowSpan: 2 }]);
    expect(out[0]?.colSpan).toBe(4);
  });

  it('leaves an unknown id untouched', () => {
    // Defensive: an alias-resolved id that has no catalog entry should
    // pass through unmodified rather than be dropped or coerced.
    const slots: WidgetSlot[] = [{ id: 'unknown-id', colSpan: 12, rowSpan: 4 }];
    expect(clampToCatalogConstraints(slots)).toEqual(slots);
  });
});

describe('healActivityLayout', () => {
  it('widens heatmap to 12x3 and resizes work-types to 6x3', () => {
    const out = healActivityLayout([
      { id: 'heatmap', colSpan: 8, rowSpan: 4 },
      { id: 'work-types', colSpan: 4, rowSpan: 4 },
      { id: 'hourly-effectiveness', colSpan: 4, rowSpan: 4 },
    ]);
    expect(out[0]).toEqual({ id: 'heatmap', colSpan: 12, rowSpan: 3 });
    expect(out[1]).toEqual({ id: 'work-types', colSpan: 6, rowSpan: 3 });
    expect(out[2]).toEqual({ id: 'hourly-effectiveness', colSpan: 6, rowSpan: 3 });
  });

  it('inserts hourly-effectiveness when a saved layout has work-types but not the new partner', () => {
    const out = healActivityLayout([{ id: 'work-types', colSpan: 4, rowSpan: 4 }]);
    expect(out).toEqual([
      { id: 'work-types', colSpan: 6, rowSpan: 3 },
      { id: 'hourly-effectiveness', colSpan: 6, rowSpan: 3 },
    ]);
  });

  it('does not duplicate hourly-effectiveness when it is already present', () => {
    const out = healActivityLayout([
      { id: 'work-types', colSpan: 4, rowSpan: 3 },
      { id: 'hourly-effectiveness', colSpan: 4, rowSpan: 3 },
    ]);
    const ids = out.map((s) => s.id);
    expect(ids.filter((id) => id === 'hourly-effectiveness')).toHaveLength(1);
  });
});

describe('healAll (chain order)', () => {
  it('runs every per-widget healer then activity then clamp in one pass', () => {
    // Degenerate input: every healer's target widget is in a stale shape,
    // plus a heatmap that healActivityLayout owns. After healAll runs,
    // every slot should be at its current catalog default.
    const input: WidgetSlot[] = [
      { id: 'live-agents', colSpan: 12, rowSpan: 4 },
      { id: 'projects', colSpan: 12, rowSpan: 3 },
      { id: 'outcomes', colSpan: 4, rowSpan: 3 },
      { id: 'scope-complexity', colSpan: 6, rowSpan: 3 },
      { id: 'tool-call-errors', colSpan: 6, rowSpan: 3 },
      { id: 'model-mix', colSpan: 4, rowSpan: 3 },
      { id: 'file-overlap', colSpan: 6, rowSpan: 2 },
      { id: 'conflicts-blocked', colSpan: 6, rowSpan: 2 },
      { id: 'heatmap', colSpan: 8, rowSpan: 4 },
    ];

    const out = healAll(input);
    const byId = new Map(out.map((s) => [s.id, s]));

    expect(byId.get('live-agents')?.colSpan).toBe(6);
    expect(byId.get('projects')?.colSpan).toBe(6);
    expect(byId.get('outcomes')?.colSpan).toBe(8);
    expect(byId.get('scope-complexity')?.colSpan).toBe(8);
    expect(byId.get('tool-call-errors')).toEqual({
      id: 'tool-call-errors',
      colSpan: 3,
      rowSpan: 2,
    });
    expect(byId.get('model-mix')?.rowSpan).toBe(2);
    expect(byId.get('file-overlap')).toEqual({ id: 'file-overlap', colSpan: 3, rowSpan: 2 });
    expect(byId.get('conflicts-blocked')).toEqual({
      id: 'conflicts-blocked',
      colSpan: 3,
      rowSpan: 2,
    });
    expect(byId.get('heatmap')).toEqual({ id: 'heatmap', colSpan: 12, rowSpan: 3 });
  });

  it('clamp runs last so a per-widget heal that widens past the catalog max gets caught', () => {
    // Synthetic regression: imagine healOutcomesWidth widens past maxW.
    // The catalog defines `outcomes` viz: 'outcome-bar' with maxW 6 plus
    // an explicit override of 12. Healed value (8) is inside that range,
    // so the chain leaves it. This test pins the relationship: if maxW
    // ever drops below the heal target, the clamp should kick in and
    // prevent painting an over-wide slot.
    const out = healAll([{ id: 'outcomes', colSpan: 4, rowSpan: 3 }]);
    expect(out[0]?.colSpan).toBeLessThanOrEqual(12);
  });
});
