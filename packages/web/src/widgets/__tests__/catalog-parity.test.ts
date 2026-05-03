import { describe, it, expect } from 'vitest';

import { WIDGET_CATALOG, DEFAULT_LAYOUT, getWidget } from '../widget-catalog.js';
import { widgetBodies } from '../bodies/registry.js';
import {
  ACTIVITY_DEFAULT_LAYOUT,
  TRENDS_DEFAULT_LAYOUT,
} from '../../views/ProjectView/projectTabDefaults.js';

// Catalog/registry/default-layout parity. Widget identity is asserted across
// the catalog list, the bodies registry, and the default layouts. Drift between
// any two surfaces produces a widget that "works"
// in code but renders empty (catalog without body), surfaces in the picker
// but is dead (body without catalog), or breaks first paint (default-layout id
// with no body).
//
// These assertions pin the contract. They are cheap insurance against the
// slowest class of bug in dashboard catalogs: a widget id renamed in one place
// but not the others.
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

  it('every DEFAULT_LAYOUT id maps to a catalog id with a body', () => {
    const broken: Array<{ id: string; reason: string }> = [];
    for (const slot of DEFAULT_LAYOUT) {
      if (!getWidget(slot.id)) {
        broken.push({ id: slot.id, reason: 'not in catalog' });
      } else if (!widgetBodies[slot.id]) {
        broken.push({ id: slot.id, reason: 'has no body' });
      }
    }
    expect(broken).toEqual([]);
  });

  it('every project-tab default id maps to a catalog id with a body', () => {
    const broken: Array<{ tab: string; id: string; reason: string }> = [];
    const surfaces = [
      { tab: 'activity', layout: ACTIVITY_DEFAULT_LAYOUT },
      { tab: 'trends', layout: TRENDS_DEFAULT_LAYOUT },
    ];
    for (const { tab, layout } of surfaces) {
      for (const slot of layout) {
        if (!getWidget(slot.id)) {
          broken.push({ tab, id: slot.id, reason: 'not in catalog' });
        } else if (!widgetBodies[slot.id]) {
          broken.push({ tab, id: slot.id, reason: 'has no body' });
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
