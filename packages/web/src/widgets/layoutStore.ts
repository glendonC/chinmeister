// Pure utilities and reducers for widget-layout persistence. No React.
//
// The v3 layout store: ordered list of WidgetSlots. Each slot carries only
// the grid-axis sizes (colSpan, rowSpan), no x/y. Rendering is CSS Grid with
// grid-auto-flow:row, so ordering is the only placement signal.
//
// Callers in packages/web/src/views/*View/use*Layout.ts compose these
// primitives into React hooks. View-specific behaviors like heal functions
// and pre-v1 legacy-key migration stay in those hook files.

import {
  defaultSlot,
  resolveWidgetAlias,
  type WidgetSlot,
  type WidgetColSpan,
  type WidgetRowSpan,
} from './widget-catalog.js';

export const STORAGE_VERSION = 3;
export const UNDO_STACK_LIMIT = 25;

export interface DashboardLayout {
  version: number;
  widgets: WidgetSlot[];
}

/**
 * v1/v2 widget shape persisted by the old react-grid-layout renderer.
 * Coordinates are dropped in the v3 migration; only id + sizes carry over.
 */
export interface LegacyWidget {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Span mapping ────────────────────────────────
// Canonical spans are the discrete sizes users can resize into. Non-canonical
// values stored by older versions clamp to the nearest (5 -> 6, 7 -> 8, 9+ -> 12).

export function mapColSpan(w: number): WidgetColSpan {
  if (w <= 3) return 3;
  if (w === 4) return 4;
  if (w <= 6) return 6;
  if (w <= 8) return 8;
  return 12;
}

export function mapRowSpan(h: number): WidgetRowSpan {
  if (h <= 2) return 2;
  if (h === 3) return 3;
  return 4;
}

// ── Migration ──────────────────────────────────

/**
 * v1/v2 -> v3. Sorts by (y, x) to preserve the user's visual reading order,
 * then drops coordinates and clamps sizes to canonical spans.
 */
export function migrateLegacyWidgets(widgets: LegacyWidget[]): WidgetSlot[] {
  return [...widgets]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((w) => ({ id: w.id, colSpan: mapColSpan(w.w), rowSpan: mapRowSpan(w.h) }));
}

// ── Alias + sanitize ───────────────────────────

/**
 * Expand deprecated widget ids (rename or split) through WIDGET_ALIASES.
 * Replacement ids reset to their catalog default size since the old slot
 * size may not fit the new widget. An unaliased id is preserved at the
 * user's stored size. Unknown ids (not in catalog, not in alias map) drop.
 * De-duplicates so an already-present replacement doesn't appear twice.
 */
export function resolveAliasesInSlots(slots: WidgetSlot[]): WidgetSlot[] {
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

/**
 * Drop slots whose ids are no longer in the catalog. Redundant after
 * resolveAliasesInSlots (which already filters via defaultSlot), useful as
 * a standalone pass when alias resolution is disabled.
 */
export function sanitizeSlotIds(slots: WidgetSlot[]): WidgetSlot[] {
  return slots.filter((s) => defaultSlot(s.id) !== null);
}

// ── Load + save ────────────────────────────────

export interface LoadOptions {
  /** Run slots through the alias map on load. Default true. */
  resolveAliases?: boolean;
  /** Drop slots whose ids are no longer in the catalog. Default true. */
  idSanitize?: boolean;
}

/**
 * Shallow slot equality. Used to decide whether a load path mutated the
 * payload enough to warrant re-persisting (so stale storage doesn't re-run
 * migration every mount).
 */
export function slotsDiffer(a: WidgetSlot[], b: WidgetSlot[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].colSpan !== b[i].colSpan || a[i].rowSpan !== b[i].rowSpan) {
      return true;
    }
  }
  return false;
}

/**
 * Load and normalize a v1/v2/v3 layout from localStorage.
 *
 * Order of operations on a v3 payload: read -> (optional) resolve aliases ->
 * (optional) sanitize ids -> re-save if the payload changed -> return.
 *
 * Order on a v1/v2 payload: read -> migrateLegacyWidgets -> aliases/sanitize ->
 * save as v3 -> return.
 *
 * No stored key, corrupt JSON, or unknown version: write the default layout
 * to `storageKey` and return it.
 */
export function loadV3(
  storageKey: string,
  defaultLayout: WidgetSlot[],
  opts: LoadOptions = {},
): DashboardLayout {
  const { resolveAliases = true, idSanitize = true } = opts;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);

      if ((parsed?.version === 1 || parsed?.version === 2) && Array.isArray(parsed.widgets)) {
        let slots = migrateLegacyWidgets(parsed.widgets as LegacyWidget[]);
        if (resolveAliases) slots = resolveAliasesInSlots(slots);
        if (idSanitize) slots = sanitizeSlotIds(slots);
        const migrated: DashboardLayout = { version: STORAGE_VERSION, widgets: slots };
        saveV3(storageKey, migrated);
        return migrated;
      }

      if (parsed?.version === STORAGE_VERSION && Array.isArray(parsed.widgets)) {
        const stored = parsed.widgets as WidgetSlot[];
        let slots = stored;
        if (resolveAliases) slots = resolveAliasesInSlots(slots);
        if (idSanitize) slots = sanitizeSlotIds(slots);
        if (slotsDiffer(stored, slots)) {
          saveV3(storageKey, { version: STORAGE_VERSION, widgets: slots });
        }
        return { version: STORAGE_VERSION, widgets: slots };
      }
    }
  } catch {
    // Corrupt storage: fall through to default.
  }

  const def = buildDefaultLayout(defaultLayout);
  saveV3(storageKey, def);
  return def;
}

export function saveV3(storageKey: string, layout: DashboardLayout): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Ignore storage quota.
  }
}

/**
 * Fresh DashboardLayout from a default slot list. Shallow-copies each slot
 * so callers mutating the returned widgets don't affect the source constant.
 */
export function buildDefaultLayout(defaultLayout: WidgetSlot[]): DashboardLayout {
  return { version: STORAGE_VERSION, widgets: defaultLayout.map((s) => ({ ...s })) };
}

// ── Pure reducers over WidgetSlot[] ────────────
// These take and return a slot list. React hooks wrap them with the
// DashboardLayout envelope and the setAndSave side effect.

/**
 * Toggle: add the widget at its catalog default size if absent, remove if
 * present. No-op if the id isn't in the catalog.
 */
export function toggleSlot(slots: WidgetSlot[], id: string): WidgetSlot[] {
  const exists = slots.some((s) => s.id === id);
  if (exists) return slots.filter((s) => s.id !== id);
  const slot = defaultSlot(id);
  if (!slot) return slots;
  return [...slots, slot];
}

/**
 * Insert a catalog widget at an index in the ordered list. Used by
 * drag-from-catalog: the drop location becomes the insertion point in the
 * CSS Grid source order. No-op if the widget is already present or the id
 * isn't in the catalog. Index is clamped to [0, slots.length].
 */
export function addSlotAt(slots: WidgetSlot[], id: string, index: number): WidgetSlot[] {
  if (slots.some((s) => s.id === id)) return slots;
  const slot = defaultSlot(id);
  if (!slot) return slots;
  const clamped = Math.max(0, Math.min(index, slots.length));
  const next = [...slots];
  next.splice(clamped, 0, slot);
  return next;
}

export function removeSlot(slots: WidgetSlot[], id: string): WidgetSlot[] {
  return slots.filter((s) => s.id !== id);
}

/**
 * Reorder via @dnd-kit sortable. Accepts the full new ordered id list;
 * appends any widgets not in `ids` to preserve data (defensive, shouldn't
 * normally happen).
 */
export function reorderSlots(slots: WidgetSlot[], ids: string[]): WidgetSlot[] {
  const byId = new Map(slots.map((s) => [s.id, s]));
  const reordered = ids.map((id) => byId.get(id)).filter((s): s is WidgetSlot => !!s);
  for (const s of slots) {
    if (!ids.includes(s.id)) reordered.push(s);
  }
  return reordered;
}

/**
 * Resize a single slot. Both fields optional; omitted fields keep their
 * current value.
 */
export function resizeSlot(
  slots: WidgetSlot[],
  id: string,
  size: { colSpan?: WidgetColSpan; rowSpan?: WidgetRowSpan },
): WidgetSlot[] {
  return slots.map((s) =>
    s.id === id
      ? {
          ...s,
          colSpan: size.colSpan ?? s.colSpan,
          rowSpan: size.rowSpan ?? s.rowSpan,
        }
      : s,
  );
}
