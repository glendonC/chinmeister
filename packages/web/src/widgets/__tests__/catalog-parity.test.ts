import { describe, it, expect } from 'vitest';

import {
  WIDGET_CATALOG,
  WIDGET_ALIASES,
  DEFAULT_LAYOUT,
  resolveWidgetAlias,
  getWidget,
} from '../widget-catalog.js';
import { widgetBodies } from '../bodies/registry.js';
import {
  ACTIVITY_DEFAULT_LAYOUT,
  TRENDS_DEFAULT_LAYOUT,
} from '../../views/ProjectView/projectTabDefaults.js';

// Catalog/registry/alias parity. Widget identity is asserted in four places:
// the catalog list, the bodies registry, the alias map, and the default
// layouts. Drift between any two surfaces produces a widget that "works"
// in code but renders empty (catalog without body), surfaces in the picker
// but is dead (catalog without alias coverage on rename), or silently drops
// when a saved layout is loaded (default-layout id that resolves to nothing).
//
// These assertions pin the contract. They are cheap insurance against the
// slowest class of bug we have shipped: a renamed widget whose old id was
// not aliased, so saved layouts simply lost the slot at next load.
describe('widget catalog parity', () => {
  const catalogIds = new Set(WIDGET_CATALOG.map((w) => w.id));

  it('every catalog id has a body in the registry', () => {
    const missing: string[] = [];
    for (const def of WIDGET_CATALOG) {
      if (!widgetBodies[def.id]) missing.push(def.id);
    }
    expect(missing).toEqual([]);
  });

  it('every body in the registry corresponds to a catalog id', () => {
    const orphans: string[] = [];
    for (const id of Object.keys(widgetBodies)) {
      if (!catalogIds.has(id)) orphans.push(id);
    }
    expect(orphans).toEqual([]);
  });

  it('no alias key collides with a current catalog id', () => {
    // An alias key being currently-live in the catalog would mean the loader
    // expands "id A → ids X, Y" even when A is a real, painted widget. The
    // user toggles A, the loader replaces it. Reject the shape outright.
    const collisions: string[] = [];
    for (const key of Object.keys(WIDGET_ALIASES)) {
      if (catalogIds.has(key)) collisions.push(key);
    }
    expect(collisions).toEqual([]);
  });

  it('every alias value is either empty (cut) or resolves to a catalog id', () => {
    const broken: Array<{ from: string; to: string }> = [];
    for (const [from, to] of Object.entries(WIDGET_ALIASES)) {
      for (const id of to) {
        if (!catalogIds.has(id)) broken.push({ from, to: id });
      }
    }
    expect(broken).toEqual([]);
  });

  it('every DEFAULT_LAYOUT id resolves through alias to a catalog id with a body', () => {
    const broken: Array<{ id: string; reason: string }> = [];
    for (const slot of DEFAULT_LAYOUT) {
      const resolved = resolveWidgetAlias(slot.id);
      if (resolved.length === 0) {
        broken.push({ id: slot.id, reason: 'alias resolves to empty' });
        continue;
      }
      for (const rid of resolved) {
        if (!getWidget(rid)) {
          broken.push({ id: slot.id, reason: `resolved ${rid} not in catalog` });
        } else if (!widgetBodies[rid]) {
          broken.push({ id: slot.id, reason: `resolved ${rid} has no body` });
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('every project-tab default id resolves through alias to a catalog id with a body', () => {
    // ACTIVITY_DEFAULT_LAYOUT and TRENDS_DEFAULT_LAYOUT seed the project page
    // tabs. The project tab loader resolves aliases at load, so a stale id
    // still resolves cleanly, but the defaults themselves should be honest
    // against the current catalog. A default that resolves to [] (cut)
    // silently drops at first paint, leaving a tab with fewer widgets than
    // the array suggests. Surface it here so the array gets cleaned up
    // explicitly.
    const broken: Array<{ tab: string; id: string; reason: string }> = [];
    const surfaces = [
      { tab: 'activity', layout: ACTIVITY_DEFAULT_LAYOUT },
      { tab: 'trends', layout: TRENDS_DEFAULT_LAYOUT },
    ];
    for (const { tab, layout } of surfaces) {
      for (const slot of layout) {
        const resolved = resolveWidgetAlias(slot.id);
        if (resolved.length === 0) {
          broken.push({ tab, id: slot.id, reason: 'alias resolves to empty' });
          continue;
        }
        for (const rid of resolved) {
          if (!getWidget(rid)) {
            broken.push({ tab, id: slot.id, reason: `resolved ${rid} not in catalog` });
          } else if (!widgetBodies[rid]) {
            broken.push({ tab, id: slot.id, reason: `resolved ${rid} has no body` });
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
