import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import { useDndMonitor, useDroppable, type Modifier } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS, getEventCoordinates } from '@dnd-kit/utilities';

import {
  getWidget,
  type WidgetSlot,
  type WidgetColSpan,
  type WidgetRowSpan,
} from '../../widgets/widget-catalog.js';

import styles from './WidgetGrid.module.css';

export interface WidgetGridProps {
  slots: WidgetSlot[];
  editing: boolean;
  renderWidget: (id: string) => ReactNode;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onSlotSize: (id: string, size: { colSpan?: WidgetColSpan; rowSpan?: WidgetRowSpan }) => void;
  recentlyAddedId?: string | null;
}

const COL_SPAN_CHOICES: WidgetColSpan[] = [3, 4, 6, 8, 12];
const ROW_SPAN_CHOICES: WidgetRowSpan[] = [2, 3, 4];

/** Droppable id the grid container registers for catalog drops. The ancestor
 *  DndContext's onDragEnd reads this to distinguish "dropped on empty grid
 *  space" (append) from "dropped on a specific widget" (insert before). */
export const GRID_DROPPABLE_ID = 'widget-grid-append';

/** Shape of catalog drag payloads that the grid reacts to. WidgetCatalog.tsx
 *  sets exactly these fields on useDraggable.data.current. */
export interface CatalogDragPayload {
  widgetId: string;
  w: number;
  h: number;
  name: string;
}

/**
 * DragOverlay modifier that centers the cursor-carried chip on the pointer.
 *
 * Default dnd-kit DragOverlay positioning uses the original draggable's
 * top-left as the anchor, so grabbing a ~460px-wide catalog row anywhere
 * other than its left edge leaves the chip offset far left of the cursor —
 * it reads as detached and floaty. Centering on the cursor makes the chip
 * feel attached to the pointer.
 *
 * Canonical `snapCenterToCursor` implementation from @dnd-kit/modifiers
 * (package not installed; inlined here to avoid adding a dependency for a
 * single helper). Safe to apply only on DragOverlay — sortable widget
 * reorders don't render through the overlay so they're unaffected.
 */
export const snapChipToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;
  const offsetX = coords.x - draggingNodeRect.left;
  const offsetY = coords.y - draggingNodeRect.top;
  return {
    ...transform,
    x: transform.x + offsetX - draggingNodeRect.width / 2,
    y: transform.y + offsetY - draggingNodeRect.height / 2,
  };
};

interface SortableWidgetProps {
  slot: WidgetSlot;
  editing: boolean;
  highlighted: boolean;
  children: ReactNode;
  onRemove: () => void;
  onSlotSize: (size: { colSpan?: WidgetColSpan; rowSpan?: WidgetRowSpan }) => void;
}

/**
 * Dynamic row-span for `fitContent` widgets.
 *
 * The widget renders at content height (via `.widgetFit` CSS → `height: auto`),
 * then this hook measures its natural scrollHeight, computes the minimum
 * number of 80px grid tracks needed to contain it, and reports that back.
 * The caller applies it as the cell's `grid-row: span N`, which shrinks the
 * reserved grid area — neighbors in later rows flow up via `grid-auto-flow:
 * row dense`.
 *
 * Clamped to [1, declared]. Content above the declared cap scrolls inside
 * `[data-widget-zone='body']`. ResizeObserver keeps the value in sync as
 * content changes (new agents arrive, conflicts resolve, etc.). rAF debounce
 * coalesces rapid changes and avoids measurement feedback loops.
 */
function useFitRowSpan(
  enabled: boolean,
  declared: WidgetRowSpan,
  widgetRef: React.RefObject<HTMLDivElement | null>,
): WidgetRowSpan | null {
  const [rows, setRows] = useState<WidgetRowSpan | null>(null);
  useLayoutEffect(() => {
    // Skip the effect entirely when disabled. The return below gates on
    // `enabled` so stale measured state from a prior enabled run never
    // leaks out — avoids a synchronous `setRows(null)` here, which the
    // react-hooks/set-state-in-effect rule (correctly) rejects as a
    // cascading-render trigger.
    if (!enabled) return;
    const el = widgetRef.current;
    if (!el) return;
    const ROW_PX = 80;
    const GAP_PX = 24;
    let rafId = 0;
    const measure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const natural = el.scrollHeight;
        // N rows span N * ROW + (N-1) * GAP total px. Solve for N:
        //   natural <= N*ROW + (N-1)*GAP
        //   N >= (natural + GAP) / (ROW + GAP)
        const needed = Math.max(1, Math.ceil((natural + GAP_PX) / (ROW_PX + GAP_PX)));
        const clamped = Math.min(declared, needed) as WidgetRowSpan;
        setRows((prev) => (prev === clamped ? prev : clamped));
      });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      obs.disconnect();
    };
  }, [enabled, declared, widgetRef]);
  return enabled ? rows : null;
}

function SortableWidget({
  slot,
  editing,
  highlighted,
  children,
  onRemove,
  onSlotSize,
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
    disabled: !editing,
  });

  const def = getWidget(slot.id);
  const widgetName = def?.name ?? 'widget';
  const fit = def?.fitContent === true;
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const fitRows = useFitRowSpan(fit, slot.rowSpan, widgetRef);
  const effectiveRowSpan: WidgetRowSpan = fitRows ?? slot.rowSpan;

  const style: CSSProperties = {
    gridColumn: `span ${slot.colSpan}`,
    gridRow: `span ${effectiveRowSpan}`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-widget-id={slot.id}
      data-widget-viz={def?.viz ?? undefined}
      className={styles.cell}
    >
      <div
        ref={widgetRef}
        className={clsx(styles.widget, editing && styles.widgetEditing, fit && styles.widgetFit)}
        {...(editing ? attributes : {})}
        {...(editing ? listeners : {})}
      >
        {editing && (
          <div className={styles.editChrome}>
            <SizeControl colSpan={slot.colSpan} rowSpan={slot.rowSpan} onChange={onSlotSize} />
            <button
              type="button"
              className={styles.removeButton}
              onClick={onRemove}
              aria-label={`Remove ${widgetName}`}
            >
              Remove
            </button>
          </div>
        )}
        {children}
      </div>
      {highlighted && (
        <div className={styles.borderSweep} aria-hidden="true">
          <span className={styles.borderSide1} />
          <span className={styles.borderSide2} />
          <span className={styles.borderSide3} />
          <span className={styles.borderSide4} />
        </div>
      )}
    </div>
  );
}

interface SizeControlProps {
  colSpan: WidgetColSpan;
  rowSpan: WidgetRowSpan;
  onChange: (size: { colSpan?: WidgetColSpan; rowSpan?: WidgetRowSpan }) => void;
}

function SizeControl({ colSpan, rowSpan, onChange }: SizeControlProps) {
  const nextColSpan = () => {
    const idx = COL_SPAN_CHOICES.indexOf(colSpan);
    const next = COL_SPAN_CHOICES[(idx + 1) % COL_SPAN_CHOICES.length];
    onChange({ colSpan: next });
  };
  const nextRowSpan = () => {
    const idx = ROW_SPAN_CHOICES.indexOf(rowSpan);
    const next = ROW_SPAN_CHOICES[(idx + 1) % ROW_SPAN_CHOICES.length];
    onChange({ rowSpan: next });
  };
  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();
  return (
    <div className={styles.sizeControl} onPointerDown={stop} onClick={stop}>
      <button
        type="button"
        className={styles.sizeButton}
        onClick={nextColSpan}
        aria-label={`Width (currently spans ${colSpan} of 12 columns)`}
        title={`Width: ${colSpan}/12 — click to cycle`}
      >
        w:{colSpan}
      </button>
      <button
        type="button"
        className={styles.sizeButton}
        onClick={nextRowSpan}
        aria-label={`Height (currently spans ${rowSpan} rows)`}
        title={`Height: ${rowSpan} rows — click to cycle`}
      >
        h:{rowSpan}
      </button>
    </div>
  );
}

/** Sized ghost placeholder rendered in the grid flow at the drop target.
 *  Width/height match the dragged widget's colSpan × rowSpan so the user
 *  sees the actual footprint, not a generic marker. */
function GridPlaceholder({ w, h }: { w: number; h: number }) {
  return (
    <div
      className={styles.placeholder}
      style={{ gridColumn: `span ${w}`, gridRow: `span ${h}` }}
      aria-hidden="true"
    />
  );
}

function WidgetGridInner({
  slots,
  editing,
  renderWidget,
  onRemove,
  onSlotSize,
  recentlyAddedId,
}: WidgetGridProps) {
  const { setNodeRef: setGridDroppableRef, isOver: gridIsOver } = useDroppable({
    id: GRID_DROPPABLE_ID,
  });

  // Track which widget the cursor is currently hovering when a CATALOG drag
  // is active. The insertion would land BEFORE this widget. Null means
  // either no catalog drag, or the cursor is over empty grid space (which
  // hits the GRID_DROPPABLE_ID sentinel and resolves to "append at end").
  const [catalogOverId, setCatalogOverId] = useState<string | null>(null);
  // Non-null while a catalog drag is in flight. Carries w/h so the in-grid
  // ghost placeholder can size itself to the widget's real footprint.
  const [catalogDrag, setCatalogDrag] = useState<{ w: number; h: number } | null>(null);

  useDndMonitor({
    onDragStart(event) {
      const data = event.active.data.current as CatalogDragPayload | undefined;
      if (data && String(event.active.id).startsWith('catalog:')) {
        setCatalogDrag({ w: data.w, h: data.h });
      }
    },
    onDragOver(event) {
      if (!catalogDrag) return;
      const overId = event.over ? String(event.over.id) : null;
      if (overId && overId !== GRID_DROPPABLE_ID) {
        // Cursor is hovering a specific widget — that widget is the insertion
        // anchor (we'll insert BEFORE it on drop).
        setCatalogOverId(overId);
      } else {
        setCatalogOverId(null);
      }
    },
    onDragEnd() {
      setCatalogDrag(null);
      setCatalogOverId(null);
    },
    onDragCancel() {
      setCatalogDrag(null);
      setCatalogOverId(null);
    },
  });

  // Border-sweep highlight when a widget is newly added. Both paths defer
  // setHighlightedId through a timer so the effect doesn't update state
  // synchronously in its body — otherwise react-hooks/set-state-in-effect
  // flags the cascading render.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    if (!recentlyAddedId) return;
    const el = document.querySelector<HTMLElement>(`[data-widget-id="${recentlyAddedId}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!inView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const delay = inView ? 0 : 450;
    const t = setTimeout(() => setHighlightedId(recentlyAddedId), delay);
    return () => clearTimeout(t);
  }, [recentlyAddedId]);

  useEffect(() => {
    if (!highlightedId) return;
    const t = setTimeout(() => setHighlightedId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightedId]);

  const ids = slots.map((s) => s.id);

  // Where the ghost placeholder renders:
  //   - "insert": before a specific hovered widget (catalogOverId is its id)
  //   - "append": at the end of the grid when the cursor is over empty
  //     grid area (gridIsOver AND no specific widget under the cursor)
  //   - null: catalog drag is idle, or cursor hasn't entered the grid yet
  const showInsertGhost = catalogDrag && catalogOverId !== null;
  const showAppendGhost = catalogDrag && gridIsOver && catalogOverId === null;

  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div ref={setGridDroppableRef} className={styles.grid}>
        {slots.map((slot) => (
          <Fragment key={slot.id}>
            {showInsertGhost && catalogOverId === slot.id && (
              <GridPlaceholder w={catalogDrag.w} h={catalogDrag.h} />
            )}
            <SortableWidget
              slot={slot}
              editing={editing}
              highlighted={highlightedId === slot.id}
              onRemove={() => onRemove(slot.id)}
              onSlotSize={(size) => onSlotSize(slot.id, size)}
            >
              {renderWidget(slot.id)}
            </SortableWidget>
          </Fragment>
        ))}
        {showAppendGhost && <GridPlaceholder w={catalogDrag.w} h={catalogDrag.h} />}
      </div>
    </SortableContext>
  );
}

export const WidgetGrid = memo(WidgetGridInner);
