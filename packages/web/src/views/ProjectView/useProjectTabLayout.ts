import { useState, useCallback, useRef, useEffect } from 'react';
import {
  defaultSlot,
  getWidget,
  resolveWidgetAlias,
  type WidgetSlot,
  type WidgetColSpan,
  type WidgetRowSpan,
} from '../../widgets/widget-catalog.js';

// Per-tab layout persistence for the project page. Each tab (Activity, Trends)
// has its own layout stored under a separate localStorage key so users can
// customize each tab independently. v3 shape: ordered WidgetSlots with
// colSpan/rowSpan only. v1/v2 migrate by sorting stored widgets by (y,x)
// and dropping positions.
//
// Alias resolution + clamp run on every load. Mirrors useOverviewLayout so
// deprecated widget IDs (e.g. `models` → `model-mix`) heal automatically in
// both saved-layout storage AND the projectTabDefaults arrays themselves.
// Project tabs deserve the same resilience as Overview across catalog churn.

const STORAGE_VERSION = 3;
const UNDO_STACK_LIMIT = 25;

interface DashboardLayout {
  version: number;
  widgets: WidgetSlot[];
}

function storageKey(tabId: string): string {
  return `chinmeister:project-${tabId}-dashboard`;
}

function buildDefaultLayout(defaults: WidgetSlot[]): DashboardLayout {
  // Run defaults through alias resolution so a default-layout array that
  // still references a deprecated id (e.g. `models`) seeds the right
  // replacement (`model-mix`) instead of dropping the slot at first paint.
  return { version: STORAGE_VERSION, widgets: resolveAliases(defaults.map((s) => ({ ...s }))) };
}

function mapColSpan(w: number): WidgetColSpan {
  if (w <= 3) return 3;
  if (w === 4) return 4;
  if (w <= 6) return 6;
  if (w <= 8) return 8;
  return 12;
}

function mapRowSpan(h: number): WidgetRowSpan {
  if (h <= 2) return 2;
  if (h === 3) return 3;
  return 4;
}

interface LegacyWidget {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function migrateLegacyWidgets(widgets: LegacyWidget[]): WidgetSlot[] {
  return [...widgets]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((w) => ({ id: w.id, colSpan: mapColSpan(w.w), rowSpan: mapRowSpan(w.h) }));
}

// Expand deprecated widget ids (rename/split) into their replacements. An
// unaliased id is preserved at the user's stored size. Replacements drop
// back to catalog defaults since the old slot size may not fit the new
// widgets. De-duplicates so a user who already has a replacement visible
// does not end up with two copies after the expansion runs. Mirrors the
// helper in useOverviewLayout so both views stay in lockstep on alias
// handling.
function resolveAliases(slots: WidgetSlot[]): WidgetSlot[] {
  const seen = new Set<string>();
  const out: WidgetSlot[] = [];
  for (const slot of slots) {
    const ids = resolveWidgetAlias(slot.id);
    if (ids.length === 1 && ids[0] === slot.id) {
      if (!seen.has(slot.id) && defaultSlot(slot.id)) {
        seen.add(slot.id);
        out.push(slot);
      }
      continue;
    }
    for (const rid of ids) {
      if (seen.has(rid)) continue;
      const def = defaultSlot(rid);
      if (def) {
        seen.add(rid);
        out.push(def);
      }
    }
  }
  return out;
}

// Generic clamp against catalog min/max. Saved slots whose sizes now
// exceed the catalog's viz constraints get normalized to the nearest
// valid size. Source of truth is the catalog WidgetDef's min/maxW + H,
// matching the constraint `setSlotSize` enforces on every resize gesture.
// Same helper as useOverviewLayout's clampToCatalogConstraints.
function clampToCatalogConstraints(slots: WidgetSlot[]): WidgetSlot[] {
  return slots.map((s) => {
    const def = getWidget(s.id);
    if (!def) return s;
    const maxCol = (def.maxW ?? 12) as WidgetColSpan;
    const maxRow = (def.maxH ?? 4) as WidgetRowSpan;
    const minCol = (def.minW ?? 3) as WidgetColSpan;
    const minRow = (def.minH ?? 2) as WidgetRowSpan;
    const colSpan = Math.max(minCol, Math.min(maxCol, s.colSpan)) as WidgetColSpan;
    const rowSpan = Math.max(minRow, Math.min(maxRow, s.rowSpan)) as WidgetRowSpan;
    if (colSpan === s.colSpan && rowSpan === s.rowSpan) return s;
    return { ...s, colSpan, rowSpan };
  });
}

// Heal pipeline. Same shape as useOverviewLayout's, minus the Overview-
// specific healers (live-agents, projects, scope-complexity) that do not
// apply to project tabs. The clamp at the end catches any saved size
// outside the catalog's current min/max for a widget no specific healer
// covered.
function healLayout(slots: WidgetSlot[]): WidgetSlot[] {
  return clampToCatalogConstraints(slots);
}

function loadDashboard(tabId: string, defaults: WidgetSlot[]): DashboardLayout {
  try {
    const raw = localStorage.getItem(storageKey(tabId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if ((parsed?.version === 1 || parsed?.version === 2) && Array.isArray(parsed.widgets)) {
        const slots = healLayout(
          resolveAliases(migrateLegacyWidgets(parsed.widgets as LegacyWidget[])),
        );
        const migrated: DashboardLayout = { version: STORAGE_VERSION, widgets: slots };
        saveDashboard(tabId, migrated);
        return migrated;
      }
      if (parsed?.version === STORAGE_VERSION && Array.isArray(parsed.widgets)) {
        const expanded = resolveAliases(parsed.widgets as WidgetSlot[]);
        const healed = healLayout(expanded);
        const stored = parsed.widgets as WidgetSlot[];
        const changed =
          healed.length !== stored.length ||
          healed.some(
            (s, i) =>
              s.id !== stored[i]?.id ||
              s.colSpan !== stored[i]?.colSpan ||
              s.rowSpan !== stored[i]?.rowSpan,
          );
        if (changed) {
          saveDashboard(tabId, { version: STORAGE_VERSION, widgets: healed });
        }
        return { version: STORAGE_VERSION, widgets: healed };
      }
    }
  } catch {
    // Ignore corrupt storage
  }
  const def = buildDefaultLayout(defaults);
  saveDashboard(tabId, def);
  return def;
}

function saveDashboard(tabId: string, layout: DashboardLayout) {
  try {
    localStorage.setItem(storageKey(tabId), JSON.stringify(layout));
  } catch {
    // Ignore storage quota
  }
}

export function useProjectTabLayout(tabId: string, defaults: WidgetSlot[]) {
  const [dashboard, setDashboardInner] = useState<DashboardLayout>(() =>
    loadDashboard(tabId, defaults),
  );

  const dashboardRef = useRef(dashboard);
  dashboardRef.current = dashboard;

  // Re-load when the tab changes (different storage key)
  useEffect(() => {
    setDashboardInner(loadDashboard(tabId, defaults));
    // Intentionally only re-run on tabId change; defaults is stable per tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

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
        saveDashboard(tabId, next);
        return next;
      });
    },
    [pushUndoSnapshot, tabId],
  );

  const widgetIds = dashboard.widgets.map((s) => s.id);

  const toggleWidget = useCallback(
    (id: string) => {
      setAndSave((prev) => {
        const exists = prev.widgets.some((s) => s.id === id);
        if (exists) {
          return { ...prev, widgets: prev.widgets.filter((s) => s.id !== id) };
        }
        const slot = defaultSlot(id);
        if (!slot) return prev;
        return { ...prev, widgets: [...prev.widgets, slot] };
      });
    },
    [setAndSave],
  );

  // Insert a catalog widget at a specific index. Drag-from-catalog uses this
  // so the drop location becomes the insertion point in the source order.
  const addWidgetAt = useCallback(
    (id: string, index: number) => {
      setAndSave((prev) => {
        if (prev.widgets.some((s) => s.id === id)) return prev;
        const slot = defaultSlot(id);
        if (!slot) return prev;
        const widgets = [...prev.widgets];
        const clamped = Math.max(0, Math.min(index, widgets.length));
        widgets.splice(clamped, 0, slot);
        return { ...prev, widgets };
      });
    },
    [setAndSave],
  );

  const removeWidget = useCallback(
    (id: string) => {
      setAndSave((prev) => ({
        ...prev,
        widgets: prev.widgets.filter((s) => s.id !== id),
      }));
    },
    [setAndSave],
  );

  const reorderWidgets = useCallback(
    (ids: string[]) => {
      setAndSave((prev) => {
        const byId = new Map(prev.widgets.map((s) => [s.id, s]));
        const reordered = ids.map((id) => byId.get(id)).filter((s): s is WidgetSlot => !!s);
        for (const s of prev.widgets) {
          if (!ids.includes(s.id)) reordered.push(s);
        }
        return { ...prev, widgets: reordered };
      });
    },
    [setAndSave],
  );

  const setSlotSize = useCallback(
    (id: string, size: { colSpan?: WidgetColSpan; rowSpan?: WidgetRowSpan }) => {
      const def = getWidget(id);
      setAndSave((prev) => ({
        ...prev,
        widgets: prev.widgets.map((s) => {
          if (s.id !== id) return s;
          const requestedCol = size.colSpan ?? s.colSpan;
          const requestedRow = size.rowSpan ?? s.rowSpan;
          const maxCol = (def?.maxW ?? 12) as WidgetColSpan;
          const maxRow = (def?.maxH ?? 4) as WidgetRowSpan;
          const minCol = (def?.minW ?? 3) as WidgetColSpan;
          const minRow = (def?.minH ?? 2) as WidgetRowSpan;
          return {
            ...s,
            colSpan: Math.max(minCol, Math.min(maxCol, requestedCol)) as WidgetColSpan,
            rowSpan: Math.max(minRow, Math.min(maxRow, requestedRow)) as WidgetRowSpan,
          };
        }),
      }));
    },
    [setAndSave],
  );

  const resetToDefault = useCallback(() => {
    pushUndoSnapshot();
    const def = buildDefaultLayout(defaults);
    saveDashboard(tabId, def);
    setDashboardInner(def);
  }, [pushUndoSnapshot, defaults, tabId]);

  const clearAll = useCallback(() => {
    pushUndoSnapshot();
    const empty: DashboardLayout = { version: STORAGE_VERSION, widgets: [] };
    saveDashboard(tabId, empty);
    setDashboardInner(empty);
  }, [pushUndoSnapshot, tabId]);

  const undo = useCallback((): boolean => {
    const snap = undoStackRef.current.pop();
    if (!snap) return false;
    saveDashboard(tabId, snap);
    setDashboardInner(snap);
    return true;
  }, [tabId]);

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
