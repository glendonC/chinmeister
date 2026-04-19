import { useMemo, useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  GRID_DROPPABLE_ID,
  type CatalogDragPayload,
} from '../../components/WidgetGrid/WidgetGrid.js';

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

import { usePollingStore, forceRefresh } from '../../lib/stores/polling.js';
import { useAuthStore } from '../../lib/stores/auth.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { getColorHex } from '../../lib/utils.js';
import { navigate, setQueryParam, useQueryParam } from '../../lib/router.js';
import { projectGradient } from '../../lib/projectGradient.js';
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
import LiveNowView from './LiveNowView.js';
import { RANGES, type RangeDays, summarizeNames } from './overview-utils.js';
import { useOverviewLayout } from './useOverviewLayout.js';
import { useProjectFilter } from './useProjectFilter.js';
import { getWidget } from '../../widgets/widget-catalog.js';
import { WidgetRenderer } from '../../widgets/WidgetRenderer.js';
import { WidgetCatalog } from '../../widgets/WidgetCatalog.js';

import styles from './OverviewView.module.css';
import { WidgetGrid } from '../../components/WidgetGrid/WidgetGrid.js';

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
    slots,
    toggleWidget: toggleWidgetRaw,
    addWidgetAt,
    removeWidget: removeWidgetRaw,
    reorderWidgets,
    setSlotSize,
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

  // ── Drag context (covers both catalog drag AND grid reorder) ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const [catalogDragging, setCatalogDragging] = useState<CatalogDragPayload | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id);
    if (activeId.startsWith('catalog:')) {
      const data = event.active.data.current as CatalogDragPayload | undefined;
      if (data) setCatalogDragging(data);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setCatalogDragging(null);
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);

      if (activeId.startsWith('catalog:')) {
        // Catalog → grid: insert at overId's position, or append if over the
        // grid sentinel.
        const data = active.data.current as CatalogDragPayload | undefined;
        if (!data) return;
        const def = getWidget(data.widgetId);
        if (!def) return;
        const insertIndex =
          overId === GRID_DROPPABLE_ID ? slots.length : slots.findIndex((s) => s.id === overId);
        if (insertIndex < 0) return;
        addWidgetAt(data.widgetId, insertIndex);
        announce(`Added ${def.name}`);
        setRecentlyAddedId(data.widgetId);
        return;
      }

      // Sortable reorder.
      if (activeId === overId) return;
      const ids = slots.map((s) => s.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = ids.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;
      reorderWidgets(arrayMove(ids, oldIndex, newIndex));
    },
    [slots, addWidgetAt, reorderWidgets, announce],
  );

  const handleDragCancel = useCallback(() => {
    setCatalogDragging(null);
  }, []);

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
  const activeSlots = slots.filter((s) => getWidget(s.id));

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
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
              <WidgetGrid
                slots={activeSlots}
                editing={editing && !isMobile}
                recentlyAddedId={recentlyAddedId}
                renderWidget={(id) => (
                  <WidgetRenderer
                    widgetId={id}
                    analytics={analytics}
                    conversationData={conversationData}
                    summaries={sortedSummaries as Array<Record<string, unknown>>}
                    liveAgents={liveAgents}
                    locks={[]}
                    selectTeam={selectTeam}
                  />
                )}
                onReorder={reorderWidgets}
                onRemove={removeWidget}
                onSlotSize={setSlotSize}
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
      <DragOverlay dropAnimation={null}>
        {catalogDragging ? (
          <div className={styles.dragOverlayCard}>
            <span className={styles.dragOverlayName}>{catalogDragging.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
