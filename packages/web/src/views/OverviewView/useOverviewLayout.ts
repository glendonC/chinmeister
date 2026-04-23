import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DEFAULT_LAYOUT,
  type WidgetSlot,
  type WidgetColSpan,
  type WidgetRowSpan,
} from '../../widgets/widget-catalog.js';
import {
  STORAGE_VERSION,
  UNDO_STACK_LIMIT,
  loadV3,
  saveV3,
  buildDefaultLayout,
  migrateLegacyWidgets,
  resolveAliasesInSlots,
  slotsDiffer,
  toggleSlot,
  addSlotAt as addSlotAtUtil,
  removeSlot,
  reorderSlots,
  resizeSlot,
  type DashboardLayout,
  type LegacyWidget,
} from '../../widgets/layoutStore.js';

// Overview's localStorage key + the two pre-v1 keys this view used to
// write to. Newer surfaces (project tabs) never had legacy keys.
const STORAGE_KEY = 'chinmeister:overview-dashboard';
const LEGACY_IDS_KEY = 'chinmeister:overview-layout';
const LEGACY_POS_KEY = 'chinmeister:overview-positions';

// ── One-time heal functions ─────────────────────
// Snap-backs for slot widths that drifted when catalog defaults narrowed.
// Each is removable once stale storage cycled out (no telemetry on this).

// 2026-04: catalog `w` for live-agents was 12 until we narrowed it to 6 to
// match DEFAULT_LAYOUT. Users who toggled live-agents off/on (or who
// drag-added it from the catalog) before the fix have it persisted at
// colSpan: 12 - full width - even though the curated default has always
// placed it at half-width next to live-conflicts. Snap that one slot back.
function healLiveAgentsWidth(slots: WidgetSlot[]): WidgetSlot[] {
  return slots.map((s) => (s.id === 'live-agents' && s.colSpan === 12 ? { ...s, colSpan: 6 } : s));
}

// 2026-04-22: catalog `w` for projects was 12 until the comparator-table
// redesign narrowed it to 8. Same situation as live-agents above - users
// with persisted colSpan: 12 see the new table sprawl across the full row
// because the grid has way more leftover space than the cells need. Heal
// back to the new default so the redesign actually lands. Power users who
// genuinely want it at 12 can drag-resize back; the cost of one-time reset
// is lower than leaving the widget visibly broken for existing users.
function healProjectsWidth(slots: WidgetSlot[]): WidgetSlot[] {
  return slots.map((s) => (s.id === 'projects' && s.colSpan === 12 ? { ...s, colSpan: 8 } : s));
}

// Compose left-to-right so a future healer that depends on a prior heal's
// output sees that output. Today the two healers touch disjoint ids.
function applyHealers(slots: WidgetSlot[]): WidgetSlot[] {
  return healProjectsWidth(healLiveAgentsWidth(slots));
}

// ── Pre-v1 two-key migration (Overview-only) ────
// Reads `chinmeister:overview-layout` (id list) and
// `chinmeister:overview-positions` (RGL coordinates) and folds them into
// a single v3 layout. Both legacy keys are deleted on success so this
// path runs at most once per browser. Garbage in either key silently
// returns null so the caller falls through to the default layout (and
// the cleanup pass deletes the bad data anyway).
function migrateFromLegacyKeys(): DashboardLayout | null {
  try {
    const idsRaw = localStorage.getItem(LEGACY_IDS_KEY);
    const posRaw = localStorage.getItem(LEGACY_POS_KEY);
    if (!idsRaw && !posRaw) return null;

    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    const positions: Array<{ i: string; x: number; y: number; w: number; h: number }> = posRaw
      ? JSON.parse(posRaw)
      : [];
    const posMap = new Map(positions.map((p) => [p.i, p]));
    const legacy: LegacyWidget[] = ids.map((id, idx) => {
      const pos = posMap.get(id);
      return pos
        ? { id, x: pos.x, y: pos.y, w: pos.w, h: pos.h }
        : { id, x: 0, y: idx, w: 6, h: 3 };
    });
    const slots = resolveAliasesInSlots(migrateLegacyWidgets(legacy));

    removeLegacyKeys();

    return { version: STORAGE_VERSION, widgets: slots };
  } catch {
    return null;
  }
}

function removeLegacyKeys(): void {
  try {
    localStorage.removeItem(LEGACY_IDS_KEY);
    localStorage.removeItem(LEGACY_POS_KEY);
  } catch {
    // Ignore.
  }
}

// Load order: STORAGE_KEY (current v3 or in-key v1/v2) -> legacy two-key
// migration -> default. Healers run after the v3 path so a stored layout
// always has up-to-date snap-backs applied.
function loadDashboard(): DashboardLayout {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    const layout = loadV3(STORAGE_KEY, DEFAULT_LAYOUT);
    const healed = applyHealers(layout.widgets);
    if (slotsDiffer(layout.widgets, healed)) {
      const out: DashboardLayout = { version: STORAGE_VERSION, widgets: healed };
      saveV3(STORAGE_KEY, out);
      return out;
    }
    return layout;
  }

  const migrated = migrateFromLegacyKeys();
  if (migrated && migrated.widgets.length > 0) {
    saveV3(STORAGE_KEY, migrated);
    return migrated;
  }

  removeLegacyKeys();
  const def = buildDefaultLayout(DEFAULT_LAYOUT);
  saveV3(STORAGE_KEY, def);
  return def;
}

// ── Hook ─────────────────────────────────────────

export function useOverviewLayout() {
  const [dashboard, setDashboardInner] = useState<DashboardLayout>(loadDashboard);

  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);

  const undoStackRef = useRef<DashboardLayout[]>([]);

  const pushUndoSnapshot = useCallback(() => {
    const snap = dashboardRef.current;
    if (!snap) return;
    const stack = undoStackRef.current;
    stack.push(snap);
    if (stack.length > UNDO_STACK_LIMIT) stack.shift();
  }, []);

  const setAndSave = useCallback(
    (fn: (prev: DashboardLayout) => DashboardLayout) => {
      pushUndoSnapshot();
      setDashboardInner((prev) => {
        const next = fn(prev);
        saveV3(STORAGE_KEY, next);
        return next;
      });
    },
    [pushUndoSnapshot],
  );

  const widgetIds = dashboard.widgets.map((s) => s.id);

  const toggleWidget = useCallback(
    (id: string) => {
      setAndSave((prev) => ({ ...prev, widgets: toggleSlot(prev.widgets, id) }));
    },
    [setAndSave],
  );

  const addWidgetAt = useCallback(
    (id: string, index: number) => {
      setAndSave((prev) => ({ ...prev, widgets: addSlotAtUtil(prev.widgets, id, index) }));
    },
    [setAndSave],
  );

  const removeWidget = useCallback(
    (id: string) => {
      setAndSave((prev) => ({ ...prev, widgets: removeSlot(prev.widgets, id) }));
    },
    [setAndSave],
  );

  const reorderWidgets = useCallback(
    (ids: string[]) => {
      setAndSave((prev) => ({ ...prev, widgets: reorderSlots(prev.widgets, ids) }));
    },
    [setAndSave],
  );

  const setSlotSize = useCallback(
    (id: string, size: { colSpan?: WidgetColSpan; rowSpan?: WidgetRowSpan }) => {
      setAndSave((prev) => ({ ...prev, widgets: resizeSlot(prev.widgets, id, size) }));
    },
    [setAndSave],
  );

  const resetToDefault = useCallback(() => {
    pushUndoSnapshot();
    removeLegacyKeys();
    const def = buildDefaultLayout(DEFAULT_LAYOUT);
    saveV3(STORAGE_KEY, def);
    setDashboardInner(def);
  }, [pushUndoSnapshot]);

  const clearAll = useCallback(() => {
    pushUndoSnapshot();
    const empty: DashboardLayout = { version: STORAGE_VERSION, widgets: [] };
    saveV3(STORAGE_KEY, empty);
    setDashboardInner(empty);
  }, [pushUndoSnapshot]);

  const undo = useCallback((): boolean => {
    const snap = undoStackRef.current.pop();
    if (!snap) return false;
    saveV3(STORAGE_KEY, snap);
    setDashboardInner(snap);
    return true;
  }, []);

  return {
    widgetIds,
    slots: dashboard.widgets,
    toggleWidget,
    addWidgetAt,
    removeWidget,
    reorderWidgets,
    setSlotSize,
    resetToDefault,
    clearAll,
    undo,
  };
}
