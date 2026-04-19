import { memo, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

function slotStyle(slot: WidgetSlot): CSSProperties {
  return {
    gridColumn: `span ${slot.colSpan}`,
    gridRow: `span ${slot.rowSpan}`,
  };
}

interface SortableWidgetProps {
  slot: WidgetSlot;
  editing: boolean;
  highlighted: boolean;
  catalogDropTarget: boolean;
  children: ReactNode;
  onRemove: () => void;
  onSlotSize: (size: { colSpan?: WidgetColSpan; rowSpan?: WidgetRowSpan }) => void;
}

function SortableWidget({
  slot,
  editing,
  highlighted,
  catalogDropTarget,
  children,
  onRemove,
  onSlotSize,
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
    disabled: !editing,
  });

  const style: CSSProperties = {
    ...slotStyle(slot),
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  const def = getWidget(slot.id);
  const widgetName = def?.name ?? 'widget';

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-widget-id={slot.id}
      data-widget-viz={def?.viz ?? undefined}
      className={clsx(styles.cell, catalogDropTarget && styles.cellDropTarget)}
    >
      <div
        className={clsx(styles.widget, editing && styles.widgetEditing)}
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
  const [catalogActive, setCatalogActive] = useState(false);

  useDndMonitor({
    onDragStart(event) {
      const data = event.active.data.current as CatalogDragPayload | undefined;
      if (data && String(event.active.id).startsWith('catalog:')) {
        setCatalogActive(true);
      }
    },
    onDragOver(event) {
      if (!catalogActive) return;
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
      setCatalogActive(false);
      setCatalogOverId(null);
    },
    onDragCancel() {
      setCatalogActive(false);
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

  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div
        ref={setGridDroppableRef}
        className={clsx(
          styles.grid,
          catalogActive && styles.gridCatalogDrag,
          catalogActive && gridIsOver && catalogOverId === null && styles.gridAppendHover,
        )}
      >
        {slots.map((slot) => (
          <SortableWidget
            key={slot.id}
            slot={slot}
            editing={editing}
            highlighted={highlightedId === slot.id}
            catalogDropTarget={catalogActive && catalogOverId === slot.id}
            onRemove={() => onRemove(slot.id)}
            onSlotSize={(size) => onSlotSize(slot.id, size)}
          >
            {renderWidget(slot.id)}
          </SortableWidget>
        ))}
      </div>
    </SortableContext>
  );
}

export const WidgetGrid = memo(WidgetGridInner);
