import { useState, useCallback, useRef, useEffect } from 'react';
import {
  type WidgetSlot,
  type WidgetColSpan,
  type WidgetRowSpan,
} from '../../widgets/widget-catalog.js';
import {
  STORAGE_VERSION,
  UNDO_STACK_LIMIT,
  loadV3,
  saveV3,
  toggleSlot,
  addSlotAt as addSlotAtUtil,
  removeSlot,
  reorderSlots,
  resizeSlot,
  type DashboardLayout,
} from '../../widgets/layoutStore.js';

// Per-tab layout persistence for the project page. Each tab (Activity, Trends)
// has its own layout stored under a separate localStorage key so users can
// customize each tab independently. All migration, alias resolution, and id
// sanitization come from the shared layoutStore - this hook is only React
// glue and the per-tab storage-key derivation.

function storageKey(tabId: string): string {
  return `chinmeister:project-${tabId}-dashboard`;
}

export function useProjectTabLayout(tabId: string, defaults: WidgetSlot[]) {
  const [dashboard, setDashboardInner] = useState<DashboardLayout>(() =>
    loadV3(storageKey(tabId), defaults),
  );

  // Tab swap: detect tabId / defaults changes during render and reload from
  // the new key. The documented React 19 pattern (calls during render
  // re-converge in the same commit) avoids the cascade-render warning that
  // setState-in-effect would trigger. The matching undo-stack clear lives
  // in the effect below since refs cannot be mutated during render.
  // Pre-consolidation bug fix: undoStackRef previously persisted across
  // tab changes, so an undo after switching wrote one tab's slots into
  // the new tab's storage key.
  const [prevTabId, setPrevTabId] = useState(tabId);
  const [prevDefaults, setPrevDefaults] = useState(defaults);
  if (prevTabId !== tabId || prevDefaults !== defaults) {
    setPrevTabId(tabId);
    setPrevDefaults(defaults);
    setDashboardInner(loadV3(storageKey(tabId), defaults));
  }

  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);

  const undoStackRef = useRef<DashboardLayout[]>([]);
  useEffect(() => {
    undoStackRef.current = [];
  }, [tabId, defaults]);

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
        saveV3(storageKey(tabId), next);
        return next;
      });
    },
    [pushUndoSnapshot, tabId],
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
    const def: DashboardLayout = {
      version: STORAGE_VERSION,
      widgets: defaults.map((s) => ({ ...s })),
    };
    saveV3(storageKey(tabId), def);
    setDashboardInner(def);
  }, [pushUndoSnapshot, tabId, defaults]);

  const clearAll = useCallback(() => {
    pushUndoSnapshot();
    const empty: DashboardLayout = { version: STORAGE_VERSION, widgets: [] };
    saveV3(storageKey(tabId), empty);
    setDashboardInner(empty);
  }, [pushUndoSnapshot, tabId]);

  const undo = useCallback((): boolean => {
    const snap = undoStackRef.current.pop();
    if (!snap) return false;
    saveV3(storageKey(tabId), snap);
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
