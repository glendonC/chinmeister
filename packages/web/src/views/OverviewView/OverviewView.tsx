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
  snapChipToCursor,
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
import { navigate, useQueryParam } from '../../lib/router.js';
import { projectGradient } from '../../lib/projectGradient.js';
import { useUserAnalytics } from '../../hooks/useUserAnalytics.js';
import { useConversationAnalytics } from '../../hooks/useConversationAnalytics.js';
import { useDismissible } from '../../hooks/useDismissible.js';
import { useDetailDrills } from '../../hooks/useDetailDrills.js';
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
import { useDemoScenario } from '../../hooks/useDemoScenario.js';
import { getDemoData } from '../../lib/demo/index.js';
import LiveNowView from './LiveNowView.js';
import UsageDetailView from './UsageDetailView/UsageDetailView.js';
import OutcomesDetailView from './OutcomesDetailView.js';
import ActivityDetailView from './ActivityDetailView.js';
import CodebaseDetailView from './CodebaseDetailView.js';
import ToolsDetailView from './ToolsDetailView.js';
import MemoryDetailView from './MemoryDetailView.js';
import { RANGES, type RangeDays, summarizeNames } from './overview-utils.js';
import { useOverviewLayout } from './useOverviewLayout.js';
import { useProjectFilter } from './useProjectFilter.js';
import { getWidget } from '../../widgets/widget-catalog.js';
import { WidgetRenderer } from '../../widgets/WidgetRenderer.js';
import { WidgetCatalog } from '../../widgets/WidgetCatalog.js';
import type { Lock } from '../../lib/apiSchemas.js';

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

const SINGLE_PROJECT_HINT_KEY = 'chinmeister:single-project-hint-dismissed';

// Module-level stable reference for the Live widgets' `locks` prop. Inline
// `[]` rebuilds the array every render and defeats the memo on
// WidgetRenderer (shallow compare sees a new reference). The empty array
// here keeps the reference stable per module load.
const OVERVIEW_LOCKS: Lock[] = [];

// ── Main Component ────────────────────────────────

export default function OverviewView() {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
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

  const demo = useDemoScenario();
  // In demo mode, substitute the scenario's fixture summaries so the live
  // widgets, projects widget, and liveAgents derivation all render from the
  // same source of truth without threading a demo flag through every hook.
  const summaries = useMemo(() => {
    if (demo.active) return getDemoData(demo.scenarioId).live.summaries;
    return dashboardData?.teams ?? [];
  }, [demo.active, demo.scenarioId, dashboardData?.teams]);
  const demoLocks = useMemo<Lock[]>(() => {
    if (!demo.active) return OVERVIEW_LOCKS;
    return getDemoData(demo.scenarioId).live.locks;
  }, [demo.active, demo.scenarioId]);
  const failedTeams = useMemo(
    () => dashboardData?.failed_teams ?? pollErrorData?.failed_teams ?? [],
    [dashboardData?.failed_teams, pollErrorData?.failed_teams],
  );

  const knownTeamCount = teams.length;
  const hasKnownProjects = knownTeamCount > 0 || summaries.length > 0;
  const failedLabel = failedTeams.length > 0 ? summarizeNames(failedTeams) : '';

  const { liveAgents, sortedSummaries } = useOverviewData(summaries);

  // Live Now full-page view. Query-param driven so the URL deep-links and
  // the back/forward buttons work. The `live` value, when present, doubles
  // as a focus hint - clicking a specific agent row in the widget passes
  // that agent_id so LiveNowView can auto-scroll to their row inside the
  // full picture. An empty string opens the view without focus. The
  // auxiliary `live-tab` param carries the initial tab when a row deep-
  // links to a specific section (conflicts/files); closeAll clears both.
  //
  // The drill chain (one useDetailDrill per category, plus the Escape
  // close handler) lives in the shared `useDetailDrills` hook so
  // ProjectView mounts the same detail surfaces by consuming the same
  // helper. Adding a new category is one entry in DETAIL_DRILL_KEYS and
  // one mount call here, not three coordinated edits.
  const { drills, anyOpen, closeAll } = useDetailDrills();
  const { live, usage, outcomes, activity, codebase, tools, memory } = drills;
  const liveTabParam = useQueryParam('live-tab');
  const liveShifted = live.shifted;
  const usageShifted = usage.shifted;
  const outcomesShifted = outcomes.shifted;
  const activityShifted = activity.shifted;
  const codebaseShifted = codebase.shifted;
  const toolsShifted = tools.shifted;
  const memoryShifted = memory.shifted;
  const focusAgentId = live.param && live.param.length > 0 ? live.param : null;

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
  // Sortable reorder state - captured at drag start so the DragOverlay
  // can render the dragged widget at its real cell dimensions. Without
  // the overlay, sortable items move via inline transform on the
  // original element, which on CSS Grid + transform combos visibly
  // inflates past their grid track. With the overlay path, the original
  // cell holds a stable placeholder and the moving widget is sized to
  // exactly what the user grabbed.
  const [sortableDragging, setSortableDragging] = useState<{
    id: string;
    w: number;
    h: number;
  } | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id);
    if (activeId.startsWith('catalog:')) {
      const data = event.active.data.current as CatalogDragPayload | undefined;
      if (data) setCatalogDragging(data);
      return;
    }
    const rect = event.active.rect.current.initial;
    if (rect) {
      setSortableDragging({ id: activeId, w: rect.width, h: rect.height });
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setCatalogDragging(null);
      setSortableDragging(null);
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
    setSortableDragging(null);
  }, []);

  // Stable render callback for WidgetGrid. Without useCallback, this arrow
  // is a new reference on every render, which busts WidgetGrid's outer
  // memo and re-creates every WidgetRenderer JSX wrapper inside.
  // WidgetRenderer itself is memo'd, so what actually matters is whether
  // its props change reference - which they don't, as long as the data
  // hooks (analytics, conversationData, liveAgents, sortedSummaries)
  // memoize their outputs. OVERVIEW_LOCKS is shared at module scope for
  // the same reason - `[]` literal would re-bust memo every render.
  const truncated = dashboardData?.truncated ?? false;
  // Widgets receive `selectTeam` as the "open this project" callback. The
  // raw team-store action only flips activeTeamId; without the navigate
  // call the URL stays at /overview and the project view never mounts -
  // visible bug on the projects widget's View pill before this wrap. Mirror
  // the existing onOpenProject pattern from the live drill-in (~line 626):
  // store action first for snappy state, navigate second so App's URL→store
  // sync effect lands on the same team.
  const openProject = useCallback(
    (teamId: string) => {
      selectTeam(teamId);
      navigate('project', teamId);
    },
    [selectTeam],
  );
  const renderWidget = useCallback(
    (id: string) => (
      <WidgetRenderer
        widgetId={id}
        analytics={analytics}
        conversationData={conversationData}
        summaries={sortedSummaries}
        liveAgents={liveAgents}
        locks={demoLocks}
        truncated={truncated}
        selectTeam={openProject}
      />
    ),
    [analytics, conversationData, sortedSummaries, liveAgents, demoLocks, truncated, openProject],
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

  // `c` opens the customize menu when the dashboard is the focus surface.
  // Per-widget resize/remove lives on the hover kebab, so there is no
  // global rearrange mode and no `r` / `Escape` handling for it here.
  // Gated on `anyOpen` so any detail drill suppresses the binding.
  useEffect(() => {
    if (isMobile || anyOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setCatalogOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile, anyOpen]);

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
                Run <code>npx chinmeister init</code> in a repo to add one.
              </>
            )
          }
        />
      </div>
    );
  }

  // Active widgets with valid definitions. The `projects` widget renders
  // at N=1 too: tools mix, 7-day activity sparkline, memory growth delta,
  // and conflicts trend aren't surfaced anywhere else on Overview, so a
  // single-project scorecard still earns its slot.
  const activeSlots = slots.filter((s) => Boolean(getWidget(s.id)));

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
            locks={demoLocks}
            focusAgentId={focusAgentId}
            initialTab={liveTabParam}
            onBack={closeAll}
            onOpenProject={(teamId) => {
              closeAll();
              selectTeam(teamId);
              navigate('project', teamId);
            }}
            onOpenTools={() => {
              closeAll();
              navigate('tools');
            }}
          />
        ) : usageShifted ? (
          <UsageDetailView
            analytics={analytics}
            initialTab={usage.param}
            onBack={usage.close}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
          />
        ) : outcomesShifted ? (
          <OutcomesDetailView
            analytics={analytics}
            initialTab={outcomes.param}
            onBack={outcomes.close}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
          />
        ) : activityShifted ? (
          <ActivityDetailView
            analytics={analytics}
            initialTab={activity.param}
            onBack={activity.close}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
          />
        ) : codebaseShifted ? (
          <CodebaseDetailView
            analytics={analytics}
            initialTab={codebase.param}
            onBack={codebase.close}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
          />
        ) : toolsShifted ? (
          <ToolsDetailView
            analytics={analytics}
            initialTab={tools.param}
            onBack={tools.close}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
          />
        ) : memoryShifted ? (
          <MemoryDetailView
            analytics={analytics}
            initialTab={memory.param}
            onBack={memory.close}
            rangeDays={rangeDays}
            onRangeChange={setRangeDays}
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
                      kbd="c"
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

            {/*
              Period clamp notice. The worker caps multi-team aggregation at
              CROSS_TEAM_MAX_DAYS (30) to bound memory; when the user picks
              a longer range, the response carries the actual capped window
              in period_days. Surface it so the chart isn't silently lying
              about its window. Uses --muted (not --accent) per the design
              language: this is static informational state, not a real-time
              signal.
            */}
            {analytics.period_days > 0 && analytics.period_days < rangeDays && (
              <div className={styles.infoNotice}>
                <span className={styles.infoNoticeLabel}>Range capped</span>
                <span className={styles.infoNoticeText}>
                  Showing the last {analytics.period_days} days. Cross-project analytics cap longer
                  ranges to keep responses fast.
                </span>
              </div>
            )}

            {/*
              Truncation notice. When the user belongs to more teams than
              MAX_DASHBOARD_TEAMS (25), the route drops the overflow and
              ships truncated_teams = N - 25. The banner is honest about
              "showing N of M": the alternative was a silent partial that
              looked like all-projects.
            */}
            {analytics.truncated_teams > 0 && (
              <div className={styles.infoNotice}>
                <span className={styles.infoNoticeLabel}>Projects capped</span>
                <span className={styles.infoNoticeText}>
                  Showing {analytics.teams_included} of{' '}
                  {analytics.teams_included + analytics.truncated_teams} projects.
                </span>
              </div>
            )}

            {/* ── Widget Grid ── */}
            <div className={styles.gridBleed}>
              <WidgetGrid
                slots={activeSlots}
                recentlyAddedId={recentlyAddedId}
                renderWidget={renderWidget}
                onReorder={reorderWidgets}
                onRemove={removeWidget}
              />
            </div>

            {/* ── Single-project hint (floating, bottom-center of content column) ── */}
            {teams.length === 1 &&
              !catalogOpen &&
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
          resetToDefault={resetToDefault}
          clearAll={clearAll}
          viewScope="overview"
        />
      </div>
      <DragOverlay
        dropAnimation={null}
        modifiers={catalogDragging ? [snapChipToCursor] : undefined}
      >
        {catalogDragging ? (
          <div className={styles.dragOverlayCard}>
            <span className={styles.dragOverlayName}>{catalogDragging.name}</span>
          </div>
        ) : sortableDragging ? (
          <div
            className={styles.dragOverlayWidget}
            style={{ width: sortableDragging.w, height: sortableDragging.h }}
          >
            {renderWidget(sortableDragging.id)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
