import { describe, it, expect } from 'vitest';

import { normalizeCurrentLayout } from './useOverviewLayout.js';
import type { WidgetSlot } from '../../widgets/widget-catalog.js';

describe('normalizeCurrentLayout', () => {
  it('clamps a current slot past its catalog max', () => {
    // `cost` is viz: 'stat' which has maxW 4. A 12-col cost slot from a
    // manual storage edit should clamp to the current catalog constraint.
    const out = normalizeCurrentLayout([{ id: 'cost', colSpan: 12, rowSpan: 2 }]);
    expect(out[0]?.colSpan).toBe(4);
  });

  it('drops unknown ids', () => {
    const slots: WidgetSlot[] = [{ id: 'unknown-id', colSpan: 12, rowSpan: 4 }];
    expect(normalizeCurrentLayout(slots)).toEqual([]);
  });

  it('deduplicates current ids while preserving first occurrence', () => {
    const out = normalizeCurrentLayout([
      { id: 'projects', colSpan: 6, rowSpan: 3 },
      { id: 'projects', colSpan: 6, rowSpan: 3 },
    ]);
    expect(out).toEqual([{ id: 'projects', colSpan: 6, rowSpan: 3 }]);
  });
});
