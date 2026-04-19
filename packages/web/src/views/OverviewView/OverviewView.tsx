import {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { Responsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  useDndMonitor,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from '@dnd-kit/core';

// ── Drag-from-catalog (dnd-kit) ──────────────────
// Every import above has a consumer in the helpers below so on-save
// "remove unused imports" doesn't strip them between edits.

type DragPayload = { widgetId: string; w: number; h: number; name: string };
export const GRID_DROPPABLE_ID = 'overview-grid';

// Grid math at the lg/md breakpoint. sm/xs/xxs are stacked and the catalog
// is hidden on mobile, so we only support snap on the 12-col desktop layout.
const DND_GRID_COLS = 12;
const DND_MARGIN_X = 24;
const DND_MARGIN_Y = 24;
const DND_ROW_HEIGHT = 80;

// Hook mounted inside the droppable container. Returns the droppable ref +
// the currently-snapped cell so the consumer can render a preview.
function useGridDrop(
  containerRef: RefObject<HTMLDivElement | null>,
  width: number,
  onDrop: (id: string, x: number, y: number) => void,
) {
  const { setNodeRef } = useDroppable({ id: GRID_DROPPABLE_ID });
  const [snap, setSnap] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const snapRef = useRef(snap);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  const cellPx = useMemo(() => {
    const colWidth = Math.max(0, (width - (DND_GRID_COLS - 1) * DND_MARGIN_X) / DND_GRID_COLS);
    return {
      colWidth,
      cellFullW: colWidth + DND_MARGIN_X,
      cellFullH: DND_ROW_HEIGHT + DND_MARGIN_Y,
    };
  }, [width]);

  // Compute the snap cell from a cursor position. Always returns a clamped
  // valid cell — no rect hit-test here. Whether to *render* the preview is
  // gated separately on dnd-kit's pointerWithin collision via event.over.
  const computeSnap = useCallback(
    (pointerX: number, pointerY: number, w: number, h: number) => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const relX = pointerX - rect.left;
      const relY = pointerY - rect.top;
      let x = Math.round((relX - (w / 2) * cellPx.cellFullW) / cellPx.cellFullW);
      let y = Math.round((relY - (h / 2) * cellPx.cellFullH) / cellPx.cellFullH);
      x = Math.max(0, Math.min(x, DND_GRID_COLS - w));
      y = Math.max(0, y);
      return { x, y, w, h };
    },
    [containerRef, cellPx],
  );

  useDndMonitor({
    onDragStart() {
      setIsDragActive(true);
    },
    onDragMove(event: DragMoveEvent) {
      const data = event.active.data.current as DragPayload | undefined;
      if (!data) return;
      // Gate on dnd-kit's own hit-test (pointerWithin). If the cursor isn't
      // over the grid droppable, clear the preview.
      if (event.over?.id !== GRID_DROPPABLE_ID) {
        setSnap(null);
        return;
      }
      const activator = event.activatorEvent as MouseEvent | TouchEvent;
      const sx =
        'clientX' in activator
          ? (activator as MouseEvent).clientX
          : ((activator as TouchEvent).touches?.[0]?.clientX ?? 0);
      const sy =
        'clientY' in activator
          ? (activator as MouseEvent).clientY
          : ((activator as TouchEvent).touches?.[0]?.clientY ?? 0);
      setSnap(computeSnap(sx + event.delta.x, sy + event.delta.y, data.w, data.h));
    },
    onDragEnd(event: DragEndEvent) {
      const data = event.active.data.current as DragPayload | undefined;
      const cur = snapRef.current;
      if (data && cur && event.over?.id === GRID_DROPPABLE_ID) {
        onDrop(data.widgetId, cur.x, cur.y);
      }
      setSnap(null);
      setIsDragActive(false);
    },
    onDragCancel() {
      setSnap(null);
      setIsDragActive(false);
    },
  });

  return { setDroppableRef: setNodeRef, snap, cellPx, isDragActive };
}

// Card rendered inside dnd-kit's DragOverlay — chromeless, mono label.
function WidgetDragPreview({ name, w, h }: { name: string; w: number; h: number }) {
  return (
    <div className={styles.dragOverlayCard}>
      <span className={styles.dragOverlayName}>{name}</span>
      <span className={styles.dragOverlayMeta}>
        {w}×{h}
      </span>
    </div>
  );
}

// Provider that wraps the dashboard tree. Owns `dragging` state for the
// DragOverlay; actual drop handling lives in useGridDrop inside GridContainer.
function OverviewDnd({
  children,
}: {
  children: (state: { dragging: DragPayload | null }) => ReactNode;
}) {
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const keyboard = useSensor(KeyboardSensor);
  const sensors = useSensors(pointer, keyboard);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(event: DragStartEvent) => {
        const data = event.active.data.current as DragPayload | undefined;
        if (data) setDragging(data);
      }}
      onDragEnd={() => setDragging(null)}
      onDragCancel={() => setDragging(null)}
    >
      {children({ dragging })}
      <DragOverlay dropAnimation={null}>
        {dragging ? <WidgetDragPreview name={dragging.name} w={dragging.w} h={dragging.h} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

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
  static?: boolean;
}

type RGLLayouts = { [breakpoint: string]: RGLLayout[] };

// Stable global class so RGL's `dragConfig.handle` (a raw CSS selector
// passed to react-draggable) can find its target. CSS Modules would hash
// the name and break the selector, so we hard-code a non-module class.
// We use the entire widget surface as the grab area — `cancel` excludes
// the interactive children so clicks on the Remove pill, links, or chart
// buttons don't initiate drag.
const GRAB_AREA_CLASS = 'widget-grab-area';

// Mobile breakpoint: below this, hide the customize/edit affordances.
// Drag-and-drop with handles is desktop-only because the touch handle
// hit areas + auto-scroll story aren't ready for phones.
const MOBILE_QUERY = '(max-width: 767px)';

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  }, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// Derive a stacked single-column layout from the lg layout. Sort widgets by
// (y, x) so the stacked order matches what the user sees on desktop, then
// place each at x:0, w:cols, y stacked sequentially.
function deriveStackedLayout(layout: RGLLayout[], cols: number): RGLLayout[] {
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  let y = 0;
  return sorted.map((item) => {
    const stacked: RGLLayout = {
      ...item,
      x: 0,
      w: Math.min(item.w, cols),
      y,
    };
    y += item.h;
    return stacked;
  });
}

import { usePollingStore, forceRefresh } from '../../lib/stores/polling.js';
import { useAuthStore } from '../../lib/stores/auth.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { getColorHex } from '../../lib/utils.js';
import { navigate, setQueryParam, useQueryParam } from '../../lib/router.js';
import { projectGradient } from '../../lib/projectGradient.js';
import type { UserAnalytics, ConversationAnalytics } from '../../lib/apiSchemas.js';
import { useUserAnalytics } from '../../hooks/useUserAnalytics.js';
import { useConversationAnalytics } from '../../hooks/useConversationAnalytics.js';
import { useDismissible } from '../../hooks/useDismissible.js';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import InlineHint from '../../components/InlineHint/InlineHint.jsx';
import StatusState from '../../components/StatusState/StatusState.jsx';
import ViewHeader from '../../components/ViewHeader/ViewHeader.jsx';
import CustomizeButton from '../../components/CustomizeButton/CustomizeButton.jsx';
import RangePills from '../../components/RangePills/RangePills.jsx';
import {
  ShimmerText,
  SkeletonStatGrid,
  SkeletonRows,
} from '../../components/Skeleton/Skeleton.jsx';
import { useOverviewData } from './useOverviewData.js';
import type { LiveAgent } from '../../widgets/types.js';
import LiveNowView from './LiveNowView.js';
import { RANGES, type RangeDays, summarizeNames } from './overview-utils.js';
import { useOverviewLayout } from './useOverviewLayout.js';
import { useProjectFilter } from './useProjectFilter.js';
import { getWidget } from '../../widgets/widget-catalog.js';
import { WidgetRenderer } from '../../widgets/WidgetRenderer.js';
import { WidgetCatalog } from '../../widgets/WidgetCatalog.js';

import styles from './OverviewView.module.css';

const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 };
const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const GRID_MARGIN: [number, number] = [24, 24];
const GRID_ROW_HEIGHT = 80;

// ── Grid container with width measurement ────────

function GridContainer({
  editing,
  gridLayout,
  onLayoutChange,
  onInteractionStart,
  onInteractionStop,
  activeWidgets,
  analytics,
  conversationData,
  summaries,
  liveAgents,
  selectTeam,
  removeWidget,
  recentlyAddedId,
  onDropWidget,
}: {
  editing: boolean;
  gridLayout: RGLLayout[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onLayoutChange: (current: any, all: any) => void;
  onInteractionStart: () => void;
  onInteractionStop: () => void;
  activeWidgets: string[];
  analytics: UserAnalytics;
  conversationData: ConversationAnalytics;
  summaries: Array<Record<string, unknown>>;
  liveAgents: LiveAgent[];
  selectTeam: (id: string) => void;
  removeWidget: (id: string) => void;
  recentlyAddedId: string | null;
  onDropWidget: (id: string, x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  // Wire the grid as a dnd-kit drop target. Returns snap cell + cell px so we
  // can render the preview ghost at the target location.
  const { setDroppableRef, snap, cellPx, isDragActive } = useGridDrop(
    containerRef,
    width,
    onDropWidget,
  );
  const setContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      setDroppableRef(el);
    },
    [setDroppableRef],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    obs.observe(containerRef.current);
    setWidth(containerRef.current.offsetWidth);
    return () => obs.disconnect();
  }, []);

  // Per-breakpoint layouts. lg/md keep the stored 12-col layout. sm/xs/xxs
  // are derived single-column stacks so the dashboard is readable on
  // tablets and phones (the stored layout was previously fed into a 2-col
  // mobile grid and clamped, producing a horizontally-scrolling mess).
  const layouts = useMemo(
    () => ({
      lg: gridLayout,
      md: gridLayout,
      sm: deriveStackedLayout(gridLayout, GRID_COLS.sm),
      xs: deriveStackedLayout(gridLayout, GRID_COLS.xs),
      xxs: deriveStackedLayout(gridLayout, GRID_COLS.xxs),
    }),
    [gridLayout],
  );

  // Toggle a `data-dragging` attribute on the grid container directly via
  // ref — never via React state. RGL fires drag callbacks at ~60Hz, and a
  // setState here would re-render all 50 widgets every frame.
  const handleDragStart = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.dataset.dragging = 'true';
    }
    onInteractionStart();
  }, [onInteractionStart]);

  const handleDragStop = useCallback(() => {
    if (containerRef.current) {
      delete containerRef.current.dataset.dragging;
    }
    onInteractionStop();
  }, [onInteractionStop]);

  // On add: find the new widget in the DOM, then decide scroll + highlight.
  // RGL may need multiple commits before the new grid-item lands in the DOM,
  // so we poll with requestAnimationFrame up to ~10 frames (~167ms) before
  // giving up. Without the retry, querySelector fails silently on the first
  // frame and the highlight never fires.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    if (!recentlyAddedId) return;
    let rafId: number | null = null;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const tryFind = () => {
      const el = containerRef.current?.querySelector(`[data-widget-id="${recentlyAddedId}"]`);
      if (!(el instanceof HTMLElement)) {
        if (attempts++ < 10) {
          rafId = requestAnimationFrame(tryFind);
        }
        return;
      }
      const rect = el.getBoundingClientRect();
      const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (inView) {
        setHighlightedId(recentlyAddedId);
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        scrollTimer = setTimeout(() => setHighlightedId(recentlyAddedId), 450);
      }
    };
    rafId = requestAnimationFrame(tryFind);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, [recentlyAddedId]);

  useEffect(() => {
    if (!highlightedId) return;
    const t = setTimeout(() => setHighlightedId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightedId]);

  return (
    <div
      ref={setContainerRef}
      className={clsx(editing && styles.widgetEditing)}
      // Extend the droppable's hit area below the last widget ONLY while a
      // drag is in progress — otherwise the extra height would leak into the
      // page's scroll geometry at rest.
      style={{ position: 'relative', paddingBottom: isDragActive ? 240 : 0 }}
    >
      {snap && cellPx.colWidth > 0 && (
        <div
          className={styles.snapPreview}
          style={{
            width: snap.w * cellPx.colWidth + (snap.w - 1) * DND_MARGIN_X,
            height: snap.h * DND_ROW_HEIGHT + (snap.h - 1) * DND_MARGIN_Y,
            transform: `translate(${snap.x * cellPx.cellFullW}px, ${snap.y * cellPx.cellFullH}px)`,
          }}
          aria-hidden="true"
        />
      )}
      {width > 0 && (
        <Responsive
          {...({
            className: 'overview-grid',
            width,
            layouts,
            breakpoints: GRID_BREAKPOINTS,
            cols: GRID_COLS,
            margin: GRID_MARGIN,
            // Zero edge padding so widget content aligns with page text.
            // Inter-widget spacing is still controlled by `margin` above.
            // Pair with the `.gridBleed` wrapper around <GridContainer/>.
            containerPadding: [0, 0],
            rowHeight: GRID_ROW_HEIGHT,
            isDraggable: editing,
            isResizable: editing,
            onLayoutChange,
            onDragStart: handleDragStart,
            onDragStop: handleDragStop,
            onResizeStart: handleDragStart,
            onResizeStop: handleDragStop,
            compactType: 'vertical',
            // Whole widget is the grab area; cancel excludes any
            // interactive child so clicks on the Remove pill, links, or
            // chart buttons don't initiate drag. The handle uses a
            // stable global class because react-draggable receives the
            // selector raw — CSS-Module hashing would silently break it.
            dragConfig: {
              handle: `.${GRAB_AREA_CLASS}`,
              cancel: 'button, a, input, select, textarea, [role="button"]',
              threshold: 5,
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)}
        >
          {activeWidgets.map((id) => (
            <div key={id} data-widget-id={id}>
              <div className={clsx(styles.widget, GRAB_AREA_CLASS)}>
                {editing && (
                  <button
                    type="button"
                    className={styles.widgetRemove}
                    onClick={() => removeWidget(id)}
                    aria-label={`Remove ${getWidget(id)?.name ?? 'widget'}`}
                  >
                    Remove
                  </button>
                )}
                <WidgetRenderer
                  widgetId={id}
                  analytics={analytics}
                  conversationData={conversationData}
                  summaries={summaries}
                  liveAgents={liveAgents}
                  locks={[]}
                  selectTeam={selectTeam}
                />
              </div>
              {highlightedId === id && (
                <div
                  className={styles.widgetBorderSweep}
                  aria-hidden="true"
                  key={`border-${id}-${highlightedId}`}
                >
                  <span className={styles.widgetBorderSide1} />
                  <span className={styles.widgetBorderSide2} />
                  <span className={styles.widgetBorderSide3} />
                  <span className={styles.widgetBorderSide4} />
                </div>
              )}
            </div>
          ))}
        </Responsive>
      )}
    </div>
  );
}

// ── Project Filter ───────────────────────────────

function ProjectFilter({
  teams,
  projectFilter,
  selectTeam: selectTeamFn,
}: {
  teams: Array<{ team_id: string; team_name?: string | null }>;
  projectFilter: ReturnType<typeof useProjectFilter>;
  selectTeam: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { isAllSelected, isSingleProject, selectedIds, toggle, selectAll, isSelected } =
    projectFilter;

  if (teams.length === 0) return null;

  if (teams.length === 1) {
    const only = teams[0];
    const label = only.team_name || only.team_id;
    return (
      <span className={styles.projectFilterStatic} title={label}>
        <span
          className={styles.projectFilterStaticSwatch}
          style={{ background: projectGradient(only.team_id) }}
          aria-hidden="true"
        />
        <span className={styles.projectFilterStaticLabel}>{label}</span>
      </span>
    );
  }

  const selectedCount = isAllSelected ? teams.length : (selectedIds?.length ?? 0);
  const label = isAllSelected
    ? 'All projects'
    : isSingleProject
      ? (teams.find((t) => t.team_id === selectedIds![0])?.team_name ?? `1 project`)
      : `${selectedCount} projects`;

  return (
    <div className={styles.projectFilter}>
      <button
        type="button"
        className={clsx(styles.projectFilterTrigger, open && styles.projectFilterTriggerActive)}
        onClick={() => setOpen(!open)}
      >
        {label}
        <svg
          className={styles.projectFilterChevron}
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 3.5 L5 6.5 L8 3.5" />
        </svg>
      </button>
      {open && (
        <>
          <div className={styles.projectFilterBackdrop} onClick={() => setOpen(false)} />
          <div className={styles.projectFilterDropdown}>
            <div className={styles.projectFilterActions}>
              <button type="button" className={styles.projectFilterAction} onClick={selectAll}>
                Select all
              </button>
            </div>
            <div className={styles.projectFilterList}>
              {teams.map((t) => {
                const checked = isSelected(t.team_id);
                return (
                  <div
                    key={t.team_id}
                    className={styles.projectFilterItem}
                    onClick={() => toggle(t.team_id)}
                  >
                    <span
                      className={clsx(
                        styles.projectFilterCheck,
                        checked && styles.projectFilterCheckOn,
                      )}
                    >
                      {checked && (
                        <svg
                          className={styles.projectFilterCheckMark}
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 5.5 L4 7.5 L8 3" />
                        </svg>
                      )}
                    </span>
                    <span className={styles.projectFilterName}>{t.team_name || t.team_id}</span>
                  </div>
                );
              })}
            </div>
            {isSingleProject && selectedIds?.[0] && (
              <div className={styles.projectFilterHint}>
                <button
                  type="button"
                  className={styles.projectFilterHintLink}
                  onClick={() => {
                    selectTeamFn(selectedIds[0]);
                    navigate('project', selectedIds[0]);
                    setOpen(false);
                  }}
                >
                  View full project dashboard
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Single-project hint (floating pill, bottom-center of content column) ──

const SINGLE_PROJECT_HINT_KEY = 'chinwag:single-project-hint-dismissed';

// ── Main Component ────────────────────────────────

export default function OverviewView() {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const { dashboardData, dashboardStatus, pollError, pollErrorData } = usePollingStore(
    useShallow((s) => ({
      dashboardData: s.dashboardData,
      dashboardStatus: s.dashboardStatus,
      pollError: s.pollError,
      pollErrorData: s.pollErrorData,
    })),
  );
  const user = useAuthStore((s) => s.user);
  const userColor = getColorHex(user?.color ?? '') || '#121317';
  const { teams, teamsError, selectTeam } = useTeamStore(
    useShallow((s) => ({
      teams: s.teams,
      teamsError: s.teamsError,
      selectTeam: s.selectTeam,
    })),
  );

  const summaries = useMemo(() => dashboardData?.teams ?? [], [dashboardData?.teams]);
  const failedTeams = useMemo(
    () => dashboardData?.failed_teams ?? pollErrorData?.failed_teams ?? [],
    [dashboardData?.failed_teams, pollErrorData?.failed_teams],
  );

  const knownTeamCount = teams.length;
  const hasKnownProjects = knownTeamCount > 0 || summaries.length > 0;
  const failedLabel = failedTeams.length > 0 ? summarizeNames(failedTeams) : '';

  const { liveAgents, sortedSummaries } = useOverviewData(summaries);

  // Live Now full-page view. Query-param driven so the URL deep-links and
  // the back/forward buttons work. The value, when present, doubles as a
  // focus hint — clicking a specific agent row in the widget passes that
  // agent_id so LiveNowView can auto-scroll to their row inside the full
  // picture. An empty string opens the view without focus.
  const liveParam = useQueryParam('live');
  const liveShifted = liveParam !== null;
  const focusAgentId = liveParam && liveParam.length > 0 ? liveParam : null;
  const closeLive = useCallback(() => setQueryParam('live', null), []);

  // Escape closes the detail view.
  useEffect(() => {
    if (!liveShifted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLive();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [liveShifted, closeLive]);

  const projectFilter = useProjectFilter(teams);
  const { analytics } = useUserAnalytics(rangeDays, true, projectFilter.selectedIds);
  const { data: conversationData } = useConversationAnalytics(
    rangeDays,
    true,
    projectFilter.selectedIds,
  );

  const {
    widgetIds,
    gridLayout: storedGridLayout,
    toggleWidget: toggleWidgetRaw,
    addWidgetAt,
    removeWidget: removeWidgetRaw,
    updatePositions,
    beginInteraction,
    commitLayout,
    resetToDefault,
    clearAll: clearAllRaw,
    undo,
  } = useOverviewLayout();

  const singleProjectHint = useDismissible(SINGLE_PROJECT_HINT_KEY);
  const isMobile = useMediaQuery(MOBILE_QUERY);

  // Visually-hidden live region for screen-reader announcements when
  // widgets are added/removed/restored. Using state (not a ref) so React
  // re-renders the message into the DOM where the live region picks it up.
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => {
    // Reset to empty first so identical messages get re-announced.
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  // Trigger for scroll + highlight. Cleared as soon as GridContainer picks
  // it up (via a no-op render cycle), so adding the same widget twice in
  // rapid succession still retriggers the effect.
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  useEffect(() => {
    if (!recentlyAddedId) return;
    const t = setTimeout(() => setRecentlyAddedId(null), 2500);
    return () => clearTimeout(t);
  }, [recentlyAddedId]);

  const toggleWidget = useCallback(
    (id: string) => {
      const def = getWidget(id);
      const wasActive = widgetIds.includes(id);
      toggleWidgetRaw(id);
      if (def) {
        announce(wasActive ? `Removed ${def.name}` : `Added ${def.name}`);
      }
      if (!wasActive) setRecentlyAddedId(id);
    },
    [toggleWidgetRaw, widgetIds, announce],
  );

  const removeWidget = useCallback(
    (id: string) => {
      const def = getWidget(id);
      removeWidgetRaw(id);
      if (def) announce(`Removed ${def.name}`);
    },
    [removeWidgetRaw, announce],
  );

  const clearAll = useCallback(() => {
    clearAllRaw();
    announce('Cleared all widgets');
  }, [clearAllRaw, announce]);

  const handleDropWidget = useCallback(
    (id: string, x: number, y: number) => {
      const def = getWidget(id);
      addWidgetAt(id, x, y);
      if (def) announce(`Added ${def.name}`);
      setRecentlyAddedId(id);
    },
    [addWidgetAt, announce],
  );

  const handleLayoutChange = useCallback(
    (currentLayout: RGLLayout[], _allLayouts: RGLLayouts) => {
      updatePositions(currentLayout);
    },
    [updatePositions],
  );

  // Cmd/Ctrl-Z to undo layout changes (drag, resize, add, remove, reset).
  // Skips when typing in inputs or contenteditable elements so it doesn't
  // hijack form-field undo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z' || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      const undone = undo();
      if (undone) {
        e.preventDefault();
        announce('Undid last layout change');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, announce]);

  // ── Guards ──────────────────────────────────────
  const isLoading = !dashboardData && (dashboardStatus === 'idle' || dashboardStatus === 'loading');
  const isUnavailable =
    dashboardStatus === 'error' || (!pollError && hasKnownProjects && summaries.length === 0);
  const unavailableHint =
    knownTeamCount === 0
      ? 'We could not load your project overview right now.'
      : knownTeamCount === 1
        ? `We found ${teams[0]?.team_name || teams[0]?.team_id || 'a connected project'}, but its overview data is unavailable right now.`
        : `We found ${knownTeamCount} connected projects, but none of their overview data could be loaded.`;
  const unavailableDetail =
    pollError ||
    (failedLabel
      ? `Unavailable now: ${failedLabel}`
      : 'Project summaries are temporarily unavailable.');

  if (isLoading) {
    return (
      <div className={styles.overview}>
        <section className={styles.header}>
          <span className={styles.eyebrow}>Overview</span>
          <ShimmerText as="h1" className={styles.loadingTitle}>
            Loading your projects
          </ShimmerText>
          <SkeletonStatGrid count={4} />
        </section>
        <SkeletonRows count={3} columns={4} />
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <div className={styles.overview}>
        <StatusState
          tone="danger"
          eyebrow="Overview unavailable"
          title="Could not load project overview"
          hint={unavailableHint}
          detail={unavailableDetail}
          meta={
            knownTeamCount > 0
              ? `${knownTeamCount} connected ${knownTeamCount === 1 ? 'project' : 'projects'}`
              : 'Overview'
          }
          actionLabel="Retry"
          onAction={forceRefresh}
        />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className={styles.overview}>
        <EmptyState
          large
          title={teamsError ? 'Could not load projects' : 'No projects yet'}
          hint={
            teamsError || (
              <>
                Run <code>npx chinwag init</code> in a repo to add one.
              </>
            )
          }
        />
      </div>
    );
  }

  // Active widgets with valid definitions
  const activeWidgets = widgetIds.filter((id) => getWidget(id));

  // Grid layout from unified store (already has constraints applied)
  const gridLayout = storedGridLayout.filter((l) => activeWidgets.includes(l.i));

  return (
    <OverviewDnd>
      {() => (
        <div className={styles.overview}>
          {liveShifted ? (
            <LiveNowView
              liveAgents={liveAgents}
              focusAgentId={focusAgentId}
              onBack={closeLive}
              onOpenProject={(teamId) => {
                closeLive();
                selectTeam(teamId);
                navigate('project', teamId);
              }}
              onOpenTools={() => {
                closeLive();
                navigate('tools');
              }}
            />
          ) : (
            <>
              {/* ── Header ── */}
              <section className={styles.header}>
                <ViewHeader
                  eyebrow="Overview"
                  title={
                    <>
                      Welcome back
                      {user?.handle ? (
                        <>
                          {', '}
                          <span style={{ color: userColor }}>{user.handle}</span>
                        </>
                      ) : null}
                      .
                    </>
                  }
                />

                {failedTeams.length > 0 && (
                  <div className={styles.summaryNotice}>
                    <span className={styles.summaryNoticeLabel}>
                      {failedTeams.length} {failedTeams.length === 1 ? 'project' : 'projects'}{' '}
                      unavailable
                    </span>
                    <span className={styles.summaryNoticeText}>{failedLabel}</span>
                  </div>
                )}

                <div className={styles.rangeRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProjectFilter
                      teams={teams}
                      projectFilter={projectFilter}
                      selectTeam={selectTeam}
                    />
                    {!isMobile && (
                      <CustomizeButton
                        active={catalogOpen}
                        onClick={() => setCatalogOpen(!catalogOpen)}
                      />
                    )}
                    <RangePills value={rangeDays} onChange={setRangeDays} options={RANGES} />
                  </div>
                </div>
              </section>

              {analytics.degraded && (
                <div className={styles.summaryNotice}>
                  <span className={styles.summaryNoticeLabel}>Partial data</span>
                  <span className={styles.summaryNoticeText}>
                    Analytics from {analytics.teams_included} of your projects. Some projects could
                    not be reached.
                  </span>
                </div>
              )}

              {/* ── Widget Grid ── */}
              <div className={styles.gridBleed}>
                <GridContainer
                  editing={editing && !isMobile}
                  gridLayout={gridLayout}
                  onLayoutChange={handleLayoutChange}
                  onInteractionStart={beginInteraction}
                  onInteractionStop={commitLayout}
                  activeWidgets={activeWidgets}
                  analytics={analytics}
                  conversationData={conversationData}
                  summaries={sortedSummaries as Array<Record<string, unknown>>}
                  liveAgents={liveAgents}
                  selectTeam={selectTeam}
                  removeWidget={removeWidget}
                  recentlyAddedId={recentlyAddedId}
                  onDropWidget={handleDropWidget}
                />
              </div>

              {/* ── Single-project hint (floating, bottom-center of content column) ── */}
              {teams.length === 1 &&
                !catalogOpen &&
                !editing &&
                !singleProjectHint.isDismissed(teams[0].team_id) && (
                  <InlineHint
                    actionLabel="Open dashboard"
                    onAction={() => {
                      selectTeam(teams[0].team_id);
                      navigate('project', teams[0].team_id);
                    }}
                    onDismiss={() => singleProjectHint.dismiss(teams[0].team_id)}
                  >
                    For a single project, the project dashboard has deeper detail.
                  </InlineHint>
                )}
            </>
          )}

          {/* Visually-hidden live region for layout-change announcements. */}
          <div role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
            {announcement}
          </div>

          {/* ── Widget catalog ── */}
          <WidgetCatalog
            open={catalogOpen}
            onClose={() => setCatalogOpen(false)}
            widgetIds={widgetIds}
            toggleWidget={toggleWidget}
            editing={editing}
            setEditing={setEditing}
            resetToDefault={resetToDefault}
            clearAll={clearAll}
            viewScope="overview"
          />
        </div>
      )}
    </OverviewDnd>
  );
}
