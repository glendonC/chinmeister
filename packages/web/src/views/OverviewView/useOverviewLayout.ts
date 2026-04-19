import { useState, useCallback, useRef, useEffect } from 'react';
import { DEFAULT_WIDGET_IDS, DEFAULT_LAYOUT, getWidget } from '../../widgets/widget-catalog.js';

// ── Unified layout store ─────────────────────────
// Single source of truth: widget IDs + grid positions in one object.
// Replaces the previous dual-store (chinwag:overview-layout + chinwag:overview-positions).

const STORAGE_KEY = 'chinwag:overview-dashboard';
const STORAGE_VERSION = 2;
const UNDO_STACK_LIMIT = 25;

// Migrate from legacy dual stores if they exist
const LEGACY_IDS_KEY = 'chinwag:overview-layout';
const LEGACY_POS_KEY = 'chinwag:overview-positions';

interface WidgetPosition {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardLayout {
  version: number;
  widgets: WidgetPosition[];
}

function buildDefaultLayout(): DashboardLayout {
  return {
    version: STORAGE_VERSION,
    widgets: DEFAULT_LAYOUT.map((l) => ({
      id: l.i,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
    })),
  };
}

function migrateLegacy(): DashboardLayout | null {
  try {
    const idsRaw = localStorage.getItem(LEGACY_IDS_KEY);
    const posRaw = localStorage.getItem(LEGACY_POS_KEY);
    if (!idsRaw && !posRaw) return null;

    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : DEFAULT_WIDGET_IDS;
    const positions: Array<{ i: string; x: number; y: number; w: number; h: number }> = posRaw
      ? JSON.parse(posRaw)
      : [];

    const posMap = new Map(positions.map((p) => [p.i, p]));
    const widgets: WidgetPosition[] = ids.map((id) => {
      const pos = posMap.get(id);
      if (pos) return { id: pos.i, x: pos.x, y: pos.y, w: pos.w, h: pos.h };
      // No stored position — use catalog defaults
      const def = getWidget(id);
      const defaultPos = DEFAULT_LAYOUT.find((l) => l.i === id);
      return {
        id,
        x: defaultPos?.x ?? 0,
        y: defaultPos?.y ?? Infinity,
        w: def?.w ?? 6,
        h: def?.h ?? 3,
      };
    });

    const layout: DashboardLayout = { version: STORAGE_VERSION, widgets };

    // Clean up legacy keys
    localStorage.removeItem(LEGACY_IDS_KEY);
    localStorage.removeItem(LEGACY_POS_KEY);

    return layout;
  } catch {
    return null;
  }
}

function isLayoutValid(layout: DashboardLayout): boolean {
  if (!layout.widgets.length) return false;
  // Check that at least some widgets use multi-column positions (not all x=0)
  const hasMultiCol = layout.widgets.some((w) => w.x > 0 || w.w > 4);
  return hasMultiCol;
}

// v1 → v2: live-agents moved from w=12 to w=6, paired with live-conflicts.
// Preserve the user's widget selection but rebuild positions from defaults
// so the new side-by-side layout takes effect.
function migrateV1ToV2(parsed: { widgets: WidgetPosition[] }): DashboardLayout {
  const selectedIds = new Set(parsed.widgets.map((w) => w.id));
  selectedIds.add('live-agents');
  selectedIds.add('live-conflicts');
  const rebuilt = buildDefaultLayout();
  rebuilt.widgets = rebuilt.widgets.filter((w) => selectedIds.has(w.id));
  for (const wp of parsed.widgets) {
    if (!rebuilt.widgets.some((w) => w.id === wp.id)) {
      const def = getWidget(wp.id);
      rebuilt.widgets.push({
        id: wp.id,
        x: 0,
        y: Infinity,
        w: def?.w ?? 6,
        h: def?.h ?? 3,
      });
    }
  }
  return rebuilt;
}

function loadDashboard(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && Array.isArray(parsed.widgets)) {
        const migrated = migrateV1ToV2(parsed);
        saveDashboard(migrated);
        return migrated;
      }
      if (parsed?.version === STORAGE_VERSION && Array.isArray(parsed.widgets)) {
        if (isLayoutValid(parsed)) return parsed;
        // Stored layout is broken (all single-column) — rebuild from defaults
        // but keep the user's widget selection
        const selectedIds = new Set(parsed.widgets.map((w: WidgetPosition) => w.id));
        const rebuilt = buildDefaultLayout();
        rebuilt.widgets = rebuilt.widgets.filter((w) => selectedIds.has(w.id));
        // Add any user widgets not in the default layout
        for (const wp of parsed.widgets) {
          if (!rebuilt.widgets.some((w) => w.id === wp.id)) {
            const def = getWidget(wp.id);
            rebuilt.widgets.push({
              id: wp.id,
              x: 0,
              y: Infinity,
              w: def?.w ?? 6,
              h: def?.h ?? 3,
            });
          }
        }
        saveDashboard(rebuilt);
        return rebuilt;
      }
    }
  } catch {
    // Ignore corrupt storage
  }

  // Try migrating from legacy stores
  const migrated = migrateLegacy();
  if (migrated && isLayoutValid(migrated)) {
    saveDashboard(migrated);
    return migrated;
  }

  // Clean up any broken legacy data
  try {
    localStorage.removeItem(LEGACY_IDS_KEY);
    localStorage.removeItem(LEGACY_POS_KEY);
  } catch {
    /* */
  }

  const def = buildDefaultLayout();
  saveDashboard(def);
  return def;
}

function saveDashboard(layout: DashboardLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Ignore storage quota
  }
}

// ── RGL layout helpers ───────────────────────────

interface RGLLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

function toRGLLayout(widgets: WidgetPosition[]): RGLLayout[] {
  return widgets.map((wp) => {
    const def = getWidget(wp.id);
    return {
      i: wp.id,
      x: wp.x,
      y: wp.y,
      w: wp.w,
      h: wp.h,
      minW: def?.minW,
      minH: def?.minH,
      maxW: def?.maxW,
      maxH: def?.maxH,
    };
  });
}

function fromRGLLayout(rgl: RGLLayout[]): WidgetPosition[] {
  return rgl.map((l) => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
}

// First-fit gap packer on a 12-column grid. Scans top-to-bottom, left-to-right
// and returns the first (x, y) where a w×h rectangle does not overlap any
// existing widget. RGL's vertical compactor is a no-op on this placement
// because first-fit already chose the lowest y that fits.
const GRID_COLS = 12;

function findFirstFit(occupied: WidgetPosition[], w: number, h: number): { x: number; y: number } {
  const width = Math.min(Math.max(1, w), GRID_COLS);
  const overlaps = (x: number, y: number): boolean => {
    for (const o of occupied) {
      if (x < o.x + o.w && x + width > o.x && y < o.y + h && y + h > o.y) {
        return true;
      }
    }
    return false;
  };
  const maxY = occupied.reduce((m, o) => Math.max(m, o.y + o.h), 0);
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= GRID_COLS - width; x++) {
      if (!overlaps(x, y)) return { x, y };
    }
  }
  return { x: 0, y: maxY };
}

// ── Hook ─────────────────────────────────────────

export function useOverviewLayout() {
  const [dashboard, setDashboardInner] = useState<DashboardLayout>(loadDashboard);

  // Latest dashboard state, kept in a ref so commit/undo can flush without re-renders.
  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);

  // Undo stack: snapshots taken before mutating actions.
  const undoStackRef = useRef<DashboardLayout[]>([]);

  // Snapshot the current state into the undo stack. Caps at UNDO_STACK_LIMIT.
  const pushUndoSnapshot = useCallback(() => {
    const snap = dashboardRef.current;
    if (!snap) return;
    const stack = undoStackRef.current;
    stack.push(snap);
    if (stack.length > UNDO_STACK_LIMIT) stack.shift();
  }, []);

  // Discrete user actions: snapshot for undo + setState + persist immediately.
  const setAndSave = useCallback(
    (fn: (prev: DashboardLayout) => DashboardLayout) => {
      pushUndoSnapshot();
      setDashboardInner((prev) => {
        const next = fn(prev);
        saveDashboard(next);
        return next;
      });
    },
    [pushUndoSnapshot],
  );

  // Derived: ordered widget IDs
  const widgetIds = dashboard.widgets.map((w) => w.id);

  // Derived: RGL layout with constraints
  const gridLayout = toRGLLayout(dashboard.widgets);

  // Toggle a widget on/off. New widgets are placed into the first top-left gap
  // that fits their w×h, so the catalog fills holes in the existing layout
  // before appending to the bottom.
  const toggleWidget = useCallback(
    (id: string) => {
      setAndSave((prev) => {
        const exists = prev.widgets.some((w) => w.id === id);
        if (exists) {
          return { ...prev, widgets: prev.widgets.filter((w) => w.id !== id) };
        }
        const def = getWidget(id);
        const w = def?.w ?? 6;
        const h = def?.h ?? 3;
        const { x, y } = findFirstFit(prev.widgets, w, h);
        return {
          ...prev,
          widgets: [...prev.widgets, { id, x, y, w, h }],
        };
      });
    },
    [setAndSave],
  );

  // Add a widget at an explicit (x, y) position. Used by drag-from-catalog
  // when the user chooses placement themselves; skips the first-fit packer.
  // No-op if the widget is already in the layout.
  const addWidgetAt = useCallback(
    (id: string, x: number, y: number) => {
      setAndSave((prev) => {
        if (prev.widgets.some((w) => w.id === id)) return prev;
        const def = getWidget(id);
        const w = def?.w ?? 6;
        const h = def?.h ?? 3;
        const clampedX = Math.max(0, Math.min(x, GRID_COLS - Math.min(w, GRID_COLS)));
        const clampedY = Math.max(0, y);
        return {
          ...prev,
          widgets: [...prev.widgets, { id, x: clampedX, y: clampedY, w, h }],
        };
      });
    },
    [setAndSave],
  );

  // Remove a widget
  const removeWidget = useCallback(
    (id: string) => {
      setAndSave((prev) => ({
        ...prev,
        widgets: prev.widgets.filter((w) => w.id !== id),
      }));
    },
    [setAndSave],
  );

  // Update positions from RGL drag/resize callback. Fires many times per
  // second mid-drag — update in-memory state ONLY, never write to
  // localStorage here. Persistence is deferred to commitLayout (called from
  // onDragStop/onResizeStop in the consumer).
  const updatePositions = useCallback((rglLayout: RGLLayout[]) => {
    setDashboardInner((prev) => {
      const idSet = new Set(prev.widgets.map((w) => w.id));
      const updated = fromRGLLayout(rglLayout.filter((l) => idSet.has(l.i)));
      return { ...prev, widgets: updated };
    });
  }, []);

  // Called from onDragStart/onResizeStart: snapshot for undo before mutation.
  const beginInteraction = useCallback(() => {
    pushUndoSnapshot();
  }, [pushUndoSnapshot]);

  // Called from onDragStop/onResizeStop: persist final layout to localStorage.
  const commitLayout = useCallback(() => {
    saveDashboard(dashboardRef.current);
  }, []);

  // Reset to default — clear everything and rebuild
  const resetToDefault = useCallback(() => {
    pushUndoSnapshot();
    try {
      localStorage.removeItem(LEGACY_IDS_KEY);
      localStorage.removeItem(LEGACY_POS_KEY);
    } catch {
      /* */
    }
    const def = buildDefaultLayout();
    saveDashboard(def);
    setDashboardInner(def);
  }, [pushUndoSnapshot]);

  // Clear every widget. Undo restores the prior layout.
  const clearAll = useCallback(() => {
    pushUndoSnapshot();
    const empty: DashboardLayout = { version: STORAGE_VERSION, widgets: [] };
    saveDashboard(empty);
    setDashboardInner(empty);
  }, [pushUndoSnapshot]);

  // Pop the latest snapshot and restore. Returns true if undo happened.
  const undo = useCallback((): boolean => {
    const snap = undoStackRef.current.pop();
    if (!snap) return false;
    saveDashboard(snap);
    setDashboardInner(snap);
    return true;
  }, []);

  return {
    widgetIds,
    gridLayout,
    toggleWidget,
    addWidgetAt,
    removeWidget,
    updatePositions,
    beginInteraction,
    commitLayout,
    resetToDefault,
    clearAll,
    undo,
  };
}
