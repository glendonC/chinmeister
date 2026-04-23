import { describe, expect, it, beforeEach } from 'vitest';
import {
  STORAGE_VERSION,
  mapColSpan,
  mapRowSpan,
  migrateLegacyWidgets,
  resolveAliasesInSlots,
  sanitizeSlotIds,
  slotsDiffer,
  loadV3,
  saveV3,
  buildDefaultLayout,
  toggleSlot,
  addSlotAt,
  removeSlot,
  reorderSlots,
  resizeSlot,
} from './layoutStore.js';

const KEY = 'chinmeister:test-layout';
const DEFAULTS = [
  { id: 'edits', colSpan: 3, rowSpan: 2 },
  { id: 'cost', colSpan: 3, rowSpan: 2 },
];

beforeEach(() => {
  localStorage.clear();
});

// ── span clamping ───────────────────────────────

describe('mapColSpan', () => {
  it('clamps to canonical spans', () => {
    expect(mapColSpan(1)).toBe(3);
    expect(mapColSpan(3)).toBe(3);
    expect(mapColSpan(4)).toBe(4);
    expect(mapColSpan(5)).toBe(6);
    expect(mapColSpan(6)).toBe(6);
    expect(mapColSpan(7)).toBe(8);
    expect(mapColSpan(8)).toBe(8);
    expect(mapColSpan(12)).toBe(12);
    expect(mapColSpan(99)).toBe(12);
  });
});

describe('mapRowSpan', () => {
  it('clamps to canonical spans', () => {
    expect(mapRowSpan(1)).toBe(2);
    expect(mapRowSpan(2)).toBe(2);
    expect(mapRowSpan(3)).toBe(3);
    expect(mapRowSpan(4)).toBe(4);
    expect(mapRowSpan(99)).toBe(4);
  });
});

// ── legacy migration ───────────────────────────

describe('migrateLegacyWidgets', () => {
  it('sorts by y then x and drops positions', () => {
    const legacy = [
      { id: 'c', x: 0, y: 1, w: 6, h: 3 },
      { id: 'a', x: 0, y: 0, w: 3, h: 2 },
      { id: 'b', x: 6, y: 0, w: 3, h: 2 },
    ];
    expect(migrateLegacyWidgets(legacy)).toEqual([
      { id: 'a', colSpan: 3, rowSpan: 2 },
      { id: 'b', colSpan: 3, rowSpan: 2 },
      { id: 'c', colSpan: 6, rowSpan: 3 },
    ]);
  });

  it('clamps non-canonical sizes', () => {
    const legacy = [{ id: 'a', x: 0, y: 0, w: 5, h: 1 }];
    expect(migrateLegacyWidgets(legacy)).toEqual([{ id: 'a', colSpan: 6, rowSpan: 2 }]);
  });

  it('handles empty input', () => {
    expect(migrateLegacyWidgets([])).toEqual([]);
  });
});

// ── alias + sanitize ───────────────────────────

describe('resolveAliasesInSlots', () => {
  it('preserves a known unaliased id at user size', () => {
    const slots = [{ id: 'edits', colSpan: 6, rowSpan: 3 }];
    expect(resolveAliasesInSlots(slots)).toEqual([{ id: 'edits', colSpan: 6, rowSpan: 3 }]);
  });

  it('expands a split alias to catalog defaults', () => {
    // memory-stats -> [memory-activity, memory-health], both at catalog defaults (6x2)
    const slots = [{ id: 'memory-stats', colSpan: 12, rowSpan: 4 }];
    expect(resolveAliasesInSlots(slots)).toEqual([
      { id: 'memory-activity', colSpan: 6, rowSpan: 2 },
      { id: 'memory-health', colSpan: 6, rowSpan: 2 },
    ]);
  });

  it('expands a single-target rename to the catalog default', () => {
    // sentiment-outcomes -> [prompt-clarity]
    const slots = [{ id: 'sentiment-outcomes', colSpan: 12, rowSpan: 3 }];
    const out = resolveAliasesInSlots(slots);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('prompt-clarity');
  });

  it('drops removed widgets (alias to empty array)', () => {
    // formation-summary -> []
    const slots = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'formation-summary', colSpan: 6, rowSpan: 3 },
    ];
    expect(resolveAliasesInSlots(slots)).toEqual([{ id: 'edits', colSpan: 3, rowSpan: 2 }]);
  });

  it('drops unknown ids that have no alias', () => {
    const slots = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'definitely-not-a-widget', colSpan: 6, rowSpan: 3 },
    ];
    expect(resolveAliasesInSlots(slots)).toEqual([{ id: 'edits', colSpan: 3, rowSpan: 2 }]);
  });

  it('dedupes when expansion target is already present', () => {
    // memory-activity already there; memory-stats expands to [memory-activity, memory-health]
    // memory-activity from the alias drops; memory-health stays
    const slots = [
      { id: 'memory-activity', colSpan: 12, rowSpan: 3 },
      { id: 'memory-stats', colSpan: 12, rowSpan: 4 },
    ];
    expect(resolveAliasesInSlots(slots)).toEqual([
      { id: 'memory-activity', colSpan: 12, rowSpan: 3 },
      { id: 'memory-health', colSpan: 6, rowSpan: 2 },
    ]);
  });

  it('dedupes consecutive duplicate ids', () => {
    const slots = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'edits', colSpan: 6, rowSpan: 3 },
    ];
    expect(resolveAliasesInSlots(slots)).toEqual([{ id: 'edits', colSpan: 3, rowSpan: 2 }]);
  });
});

describe('sanitizeSlotIds', () => {
  it('drops slots whose ids are not in the catalog', () => {
    const slots = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'not-a-widget', colSpan: 6, rowSpan: 3 },
      { id: 'cost', colSpan: 3, rowSpan: 2 },
    ];
    expect(sanitizeSlotIds(slots)).toEqual([
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'cost', colSpan: 3, rowSpan: 2 },
    ]);
  });

  it('does not resolve aliases', () => {
    // memory-stats is an alias key, not a current catalog id, so sanitize drops it
    const slots = [{ id: 'memory-stats', colSpan: 12, rowSpan: 3 }];
    expect(sanitizeSlotIds(slots)).toEqual([]);
  });
});

// ── slotsDiffer ─────────────────────────────────

describe('slotsDiffer', () => {
  it('returns false for identical lists', () => {
    const a = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    const b = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(slotsDiffer(a, b)).toBe(false);
  });

  it('returns true when length differs', () => {
    const a = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    const b = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'cost', colSpan: 3, rowSpan: 2 },
    ];
    expect(slotsDiffer(a, b)).toBe(true);
  });

  it('returns true when an id differs', () => {
    const a = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    const b = [{ id: 'cost', colSpan: 3, rowSpan: 2 }];
    expect(slotsDiffer(a, b)).toBe(true);
  });

  it('returns true when colSpan or rowSpan differs', () => {
    const a = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(slotsDiffer(a, [{ id: 'edits', colSpan: 6, rowSpan: 2 }])).toBe(true);
    expect(slotsDiffer(a, [{ id: 'edits', colSpan: 3, rowSpan: 3 }])).toBe(true);
  });
});

// ── loadV3 / saveV3 ─────────────────────────────

describe('saveV3 + loadV3 round-trip', () => {
  it('round-trips a v3 layout', () => {
    const layout = {
      version: STORAGE_VERSION,
      widgets: [
        { id: 'edits', colSpan: 3, rowSpan: 2 },
        { id: 'cost', colSpan: 6, rowSpan: 3 },
      ],
    };
    saveV3(KEY, layout);
    const loaded = loadV3(KEY, DEFAULTS);
    expect(loaded).toEqual(layout);
  });
});

describe('loadV3 with no stored data', () => {
  it('writes and returns the default layout', () => {
    const layout = loadV3(KEY, DEFAULTS);
    expect(layout.version).toBe(STORAGE_VERSION);
    expect(layout.widgets).toEqual(DEFAULTS);
    // Default was persisted
    const stored = JSON.parse(localStorage.getItem(KEY));
    expect(stored).toEqual(layout);
  });

  it('shallow-copies default slots so callers cannot mutate the source', () => {
    const layout = loadV3(KEY, DEFAULTS);
    layout.widgets[0].colSpan = 12;
    expect(DEFAULTS[0].colSpan).toBe(3);
  });
});

describe('loadV3 with corrupt JSON', () => {
  it('falls through to default and overwrites the bad payload', () => {
    localStorage.setItem(KEY, '{not valid json');
    const layout = loadV3(KEY, DEFAULTS);
    expect(layout.widgets).toEqual(DEFAULTS);
    // Corrupt payload was replaced with the default
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(layout);
  });
});

describe('loadV3 alias resolution', () => {
  it('expands aliased ids on load and re-saves', () => {
    saveV3(KEY, {
      version: STORAGE_VERSION,
      widgets: [{ id: 'memory-stats', colSpan: 12, rowSpan: 4 }],
    });
    const layout = loadV3(KEY, DEFAULTS);
    expect(layout.widgets).toEqual([
      { id: 'memory-activity', colSpan: 6, rowSpan: 2 },
      { id: 'memory-health', colSpan: 6, rowSpan: 2 },
    ]);
    // Re-saved
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(layout);
  });

  it('skips alias resolution when option is off', () => {
    saveV3(KEY, {
      version: STORAGE_VERSION,
      widgets: [{ id: 'memory-stats', colSpan: 12, rowSpan: 4 }],
    });
    const layout = loadV3(KEY, DEFAULTS, { resolveAliases: false, idSanitize: false });
    expect(layout.widgets).toEqual([{ id: 'memory-stats', colSpan: 12, rowSpan: 4 }]);
  });
});

describe('loadV3 id sanitization', () => {
  it('drops unknown ids on load and re-saves', () => {
    saveV3(KEY, {
      version: STORAGE_VERSION,
      widgets: [
        { id: 'edits', colSpan: 3, rowSpan: 2 },
        { id: 'not-a-real-widget', colSpan: 6, rowSpan: 3 },
      ],
    });
    const layout = loadV3(KEY, DEFAULTS);
    expect(layout.widgets).toEqual([{ id: 'edits', colSpan: 3, rowSpan: 2 }]);
    // Re-saved without the bad id
    expect(JSON.parse(localStorage.getItem(KEY)).widgets).toEqual(layout.widgets);
  });

  it('keeps unknown ids when option is off', () => {
    saveV3(KEY, {
      version: STORAGE_VERSION,
      widgets: [{ id: 'not-a-real-widget', colSpan: 6, rowSpan: 3 }],
    });
    const layout = loadV3(KEY, DEFAULTS, { resolveAliases: false, idSanitize: false });
    expect(layout.widgets).toEqual([{ id: 'not-a-real-widget', colSpan: 6, rowSpan: 3 }]);
  });

  it('does not re-save when payload is already clean', () => {
    const clean = {
      version: STORAGE_VERSION,
      widgets: [{ id: 'edits', colSpan: 3, rowSpan: 2 }],
    };
    saveV3(KEY, clean);
    const before = localStorage.getItem(KEY);
    loadV3(KEY, DEFAULTS);
    // Storage is unchanged (string equality, not just structural)
    expect(localStorage.getItem(KEY)).toBe(before);
  });
});

describe('loadV3 v1/v2 in-key migration', () => {
  it('migrates v1 payload to v3 and saves', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        widgets: [
          { id: 'cost', x: 0, y: 1, w: 6, h: 3 },
          { id: 'edits', x: 0, y: 0, w: 3, h: 2 },
        ],
      }),
    );
    const layout = loadV3(KEY, DEFAULTS);
    expect(layout.version).toBe(STORAGE_VERSION);
    expect(layout.widgets).toEqual([
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'cost', colSpan: 6, rowSpan: 3 },
    ]);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(layout);
  });

  it('migrates v2 payload to v3', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        widgets: [{ id: 'edits', x: 0, y: 0, w: 3, h: 2 }],
      }),
    );
    const layout = loadV3(KEY, DEFAULTS);
    expect(layout.version).toBe(STORAGE_VERSION);
    expect(layout.widgets).toEqual([{ id: 'edits', colSpan: 3, rowSpan: 2 }]);
  });

  it('runs alias resolution during legacy migration', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        widgets: [{ id: 'memory-stats', x: 0, y: 0, w: 12, h: 4 }],
      }),
    );
    const layout = loadV3(KEY, DEFAULTS);
    expect(layout.widgets).toEqual([
      { id: 'memory-activity', colSpan: 6, rowSpan: 2 },
      { id: 'memory-health', colSpan: 6, rowSpan: 2 },
    ]);
  });

  it('falls through to default when widgets array is missing or wrong type', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, widgets: 'not an array' }));
    const layout = loadV3(KEY, DEFAULTS);
    expect(layout.widgets).toEqual(DEFAULTS);
  });
});

// ── buildDefaultLayout ──────────────────────────

describe('buildDefaultLayout', () => {
  it('returns v3 envelope with shallow-copied slots', () => {
    const out = buildDefaultLayout(DEFAULTS);
    expect(out.version).toBe(STORAGE_VERSION);
    expect(out.widgets).toEqual(DEFAULTS);
    expect(out.widgets[0]).not.toBe(DEFAULTS[0]);
  });
});

// ── reducers ───────────────────────────────────

describe('toggleSlot', () => {
  it('adds an absent widget at its catalog default size', () => {
    const out = toggleSlot([], 'edits');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('edits');
  });

  it('removes a present widget', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(toggleSlot(slots, 'edits')).toEqual([]);
  });

  it('no-op for an unknown id when adding', () => {
    const out = toggleSlot([], 'definitely-not-a-widget');
    expect(out).toEqual([]);
  });
});

describe('addSlotAt', () => {
  it('inserts at the requested index', () => {
    const slots = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'cost', colSpan: 3, rowSpan: 2 },
    ];
    const out = addSlotAt(slots, 'sessions', 1);
    expect(out.map((s) => s.id)).toEqual(['edits', 'sessions', 'cost']);
  });

  it('clamps negative index to 0', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(addSlotAt(slots, 'cost', -10).map((s) => s.id)).toEqual(['cost', 'edits']);
  });

  it('clamps too-large index to end', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(addSlotAt(slots, 'cost', 999).map((s) => s.id)).toEqual(['edits', 'cost']);
  });

  it('no-op when widget already present', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(addSlotAt(slots, 'edits', 0)).toBe(slots);
  });

  it('no-op for unknown id', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(addSlotAt(slots, 'not-a-widget', 0)).toBe(slots);
  });
});

describe('removeSlot', () => {
  it('drops the matching id', () => {
    const slots = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'cost', colSpan: 3, rowSpan: 2 },
    ];
    expect(removeSlot(slots, 'edits')).toEqual([{ id: 'cost', colSpan: 3, rowSpan: 2 }]);
  });

  it('no-op when id is absent', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(removeSlot(slots, 'cost')).toEqual(slots);
  });
});

describe('reorderSlots', () => {
  it('reorders preserving sizes', () => {
    const slots = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'cost', colSpan: 6, rowSpan: 3 },
    ];
    expect(reorderSlots(slots, ['cost', 'edits'])).toEqual([
      { id: 'cost', colSpan: 6, rowSpan: 3 },
      { id: 'edits', colSpan: 3, rowSpan: 2 },
    ]);
  });

  it('appends widgets missing from ids list (defensive)', () => {
    const slots = [
      { id: 'edits', colSpan: 3, rowSpan: 2 },
      { id: 'cost', colSpan: 3, rowSpan: 2 },
      { id: 'sessions', colSpan: 3, rowSpan: 2 },
    ];
    const out = reorderSlots(slots, ['cost', 'edits']);
    expect(out.map((s) => s.id)).toEqual(['cost', 'edits', 'sessions']);
  });
});

describe('resizeSlot', () => {
  it('updates colSpan only', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(resizeSlot(slots, 'edits', { colSpan: 6 })).toEqual([
      { id: 'edits', colSpan: 6, rowSpan: 2 },
    ]);
  });

  it('updates rowSpan only', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(resizeSlot(slots, 'edits', { rowSpan: 4 })).toEqual([
      { id: 'edits', colSpan: 3, rowSpan: 4 },
    ]);
  });

  it('updates both', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(resizeSlot(slots, 'edits', { colSpan: 6, rowSpan: 3 })).toEqual([
      { id: 'edits', colSpan: 6, rowSpan: 3 },
    ]);
  });

  it('no-op when id is absent', () => {
    const slots = [{ id: 'edits', colSpan: 3, rowSpan: 2 }];
    expect(resizeSlot(slots, 'cost', { colSpan: 6 })).toEqual(slots);
  });
});
