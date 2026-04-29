import { useState, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
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

import { forceRefresh } from '../../lib/stores/polling.js';
import { teamActions } from '../../lib/stores/teams.js';
import { navigate, useQueryParam } from '../../lib/router.js';
import type { TeamSummaryLive } from '../../lib/apiSchemas.js';
import StatusState from '../../components/StatusState/StatusState.jsx';
import ViewHeader from '../../components/ViewHeader/ViewHeader.jsx';
import StatTabs from '../../components/StatTabs/StatTabs.js';
import CustomizeButton from '../../components/CustomizeButton/CustomizeButton.jsx';
import RangePills from '../../components/RangePills/RangePills.jsx';
import {
  ShimmerText,
  SkeletonStatGrid,
  SkeletonRows,
  SkeletonLine,
} from '../../components/Skeleton/Skeleton.jsx';

import { useTabs } from '../../hooks/useTabs.js';
import { useTeamExtendedAnalytics } from '../../hooks/useTeamAnalytics.js';
import { useConversationAnalytics } from '../../hooks/useConversationAnalytics.js';
import { useProjectData } from './useProjectData.js';
import { useProjectTabLayout } from './useProjectTabLayout.js';
import { ACTIVITY_DEFAULT_LAYOUT, TRENDS_DEFAULT_LAYOUT } from './projectTabDefaults.js';
import ProjectMemoryTab from './ProjectMemoryTab.jsx';
import SpawnForm from '../../components/SpawnAgentModal/SpawnAgentModal.jsx';
import { useDetailDrills } from '../../hooks/useDetailDrills.js';
import LiveNowView from '../OverviewView/LiveNowView.js';
import UsageDetailView from '../OverviewView/UsageDetailView/UsageDetailView.js';
import OutcomesDetailView from '../OverviewView/OutcomesDetailView.js';
import ActivityDetailView from '../OverviewView/ActivityDetailView.js';
import CodebaseDetailView from '../OverviewView/CodebaseDetailView.js';
import ToolsDetailView from '../OverviewView/ToolsDetailView/ToolsDetailView.js';
import MemoryDetailView from '../OverviewView/MemoryDetailView.js';

import { WidgetGrid } from '../../components/WidgetGrid/WidgetGrid.js';
import { WidgetRenderer } from '../../widgets/WidgetRenderer.js';
import { WidgetCatalog } from '../../widgets/WidgetCatalog.js';
import { getWidget } from '../../widgets/widget-catalog.js';
import type { LiveAgent } from '../../widgets/types.js';

import overviewStyles from '../OverviewView/OverviewView.module.css';
import styles from './ProjectView.module.css';

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

// ── Tab definitions ─────────────────────────────

const PROJECT_TABS = ['activity', 'trends', 'memory'] as const;
type ProjectTab = (typeof PROJECT_TABS)[number];

interface StatEntry {
  id: ProjectTab;
  label: string;
  value: string | number;
  tone: '' | 'accent';
}

// ── Main component ──────────────────────────────

interface Props {}

export default function ProjectView(_props: Props) {
  const {
    activeTeam,
    activeTeamId,
    projectLabel,
    pollError,
    lastSynced,
    isLoading,
    isUnavailable,
    activeAgents,
    conflicts,
    memories,
    memoryBreakdown,
    availableSpawnTools,
    locks,
  } = useProjectData();

  const { activeTab, setActiveTab, hint, ref: statsRef } = useTabs(PROJECT_TABS);
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [showSpawn, setShowSpawn] = useState(false);

  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isAnalytical = activeTab === 'activity' || activeTab === 'trends';

  // Detail-drill chain shared with OverviewView. Project mounts the same
  // seven detail components from views/OverviewView, scoped via the
  // useTeamExtendedAnalytics fetch (single team_id) instead of the cross-
  // project useUserAnalytics. The shared hook owns the Escape close.
  const { drills, anyOpen, closeAll } = useDetailDrills();
  const { live, usage, outcomes, activity, codebase, tools, memory } = drills;
  const liveTabParam = useQueryParam('live-tab');
  const focusAgentId = live.param && live.param.length > 0 ? live.param : null;

  // Analytics fetch gate. Detail views consume the same UserAnalytics
  // payload, so opening any drill from any tab needs the fetch active or
  // the panel paints the empty fixture. `anyOpen` widens the gate beyond
  // the analytical tabs so a drill from any tab still gets data.
  const analyticsActive = isAnalytical || anyOpen;
  const { analytics } = useTeamExtendedAnalytics(activeTeamId, rangeDays, analyticsActive);
  const { data: conversationData } = useConversationAnalytics(
    rangeDays,
    analyticsActive,
    activeTeamId ? [activeTeamId] : undefined,
  );

  // Per-tab layouts. Both hooks called unconditionally for stable hook order.
  const activityLayout = useProjectTabLayout('activity', ACTIVITY_DEFAULT_LAYOUT);
  const trendsLayout = useProjectTabLayout('trends', TRENDS_DEFAULT_LAYOUT);
  const currentLayout = activeTab === 'activity' ? activityLayout : trendsLayout;

  // ── Drag context for the active tab (catalog drop + reorder) ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const [catalogDragging, setCatalogDragging] = useState<CatalogDragPayload | null>(null);
  // Sortable reorder state - captured at drag start so the DragOverlay
  // can render the dragged widget at its real cell dimensions. Same
  // rationale as in OverviewView: keeps the moving widget sized exactly
  // to what the user grabbed instead of inflating past its grid track.
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
      const slots = currentLayout.slots;

      if (activeId.startsWith('catalog:')) {
        const data = active.data.current as CatalogDragPayload | undefined;
        if (!data) return;
        const insertIndex =
          overId === GRID_DROPPABLE_ID ? slots.length : slots.findIndex((s) => s.id === overId);
        if (insertIndex < 0) return;
        currentLayout.addWidgetAt(data.widgetId, insertIndex);
        return;
      }

      if (activeId === overId) return;
      const ids = slots.map((s) => s.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = ids.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;
      currentLayout.reorderWidgets(arrayMove(ids, oldIndex, newIndex));
    },
    [currentLayout],
  );

  const handleDragCancel = useCallback(() => {
    setCatalogDragging(null);
    setSortableDragging(null);
  }, []);

  // `c` opens the customize menu on analytical tabs (where the
  // Customize button itself renders). Per-widget resize/remove lives on
  // the hover kebab, so there is no global rearrange mode and no `r`
  // binding here. Suppress while a detail drill is open so the binding
  // does not steal `c` from the drill surface.
  useEffect(() => {
    if (isMobile || !isAnalytical || anyOpen) return;
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
  }, [isMobile, isAnalytical, anyOpen]);

  const handleDeleteMemory = useCallback(
    async (id: string) => {
      if (!activeTeamId) return;
      await teamActions.deleteMemory(activeTeamId, id);
    },
    [activeTeamId],
  );

  // Derive LiveAgent shape from project members for widgets that consume it.
  // files live under m.activity.files on project-scope Members (distinct from
  // the flat shape used by Overview's ActiveMemberSummary).
  const liveAgents: LiveAgent[] = useMemo(() => {
    if (!activeTeamId) return [];
    return activeAgents.map((m) => ({
      agent_id: m.agent_id,
      handle: m.handle,
      host_tool: m.host_tool || 'unknown',
      agent_surface: m.agent_surface ?? null,
      files: m.activity?.files ?? [],
      summary: m.activity?.summary ?? null,
      session_minutes: m.session_minutes ?? null,
      seconds_since_update: m.seconds_since_update ?? null,
      teamName: projectLabel,
      teamId: activeTeamId,
    }));
  }, [activeAgents, activeTeamId, projectLabel]);

  const summaries = useMemo<TeamSummaryLive[]>(() => [], []);

  const selectTeam = useCallback((id: string) => {
    teamActions.selectTeam(id);
    navigate('project', id);
  }, []);

  // Stable render callback for WidgetGrid. Placed here, after the data
  // dependencies it captures, because they're declared further down the
  // component body. Without useCallback, this arrow is a new reference on
  // every render, which busts WidgetGrid's outer memo and re-creates
  // every WidgetRenderer JSX wrapper inside. WidgetRenderer is memo'd, so
  // shallow-stable prop references let it skip rendering when only
  // unrelated state changes.
  const renderWidget = useCallback(
    (id: string) => (
      <WidgetRenderer
        widgetId={id}
        analytics={analytics}
        conversationData={conversationData}
        summaries={summaries}
        liveAgents={liveAgents}
        locks={locks}
        selectTeam={selectTeam}
      />
    ),
    [analytics, conversationData, summaries, liveAgents, locks, selectTeam],
  );

  const stats: StatEntry[] = [
    {
      id: 'activity',
      label: 'Activity',
      value: activeAgents.length === 0 ? 'quiet' : `${activeAgents.length} active`,
      tone: activeAgents.length > 0 ? 'accent' : '',
    },
    {
      id: 'trends',
      label: 'Trends',
      value: `${rangeDays} days`,
      tone: '',
    },
    {
      id: 'memory',
      label: 'Memory',
      value: memories.length === 0 ? 'no memories' : `${memories.length} memories`,
      tone: '',
    },
  ];

  // Cmd/Ctrl-Z to undo layout changes (matches OverviewView behavior).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z' || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      const undone = currentLayout.undo();
      if (undone) e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentLayout]);

  // ── Loading guard ──
  if (isLoading) {
    return (
      <div className={styles.page}>
        <header style={{ marginBottom: 28 }}>
          <span className={styles.loadingEyebrow}>Project</span>
          <ShimmerText as="h1" className={styles.loadingTitle}>
            {`Loading ${projectLabel}`}
          </ShimmerText>
        </header>
        <SkeletonStatGrid count={4} />
        <div style={{ marginTop: 40 }}>
          <SkeletonLine width="100%" height={32} />
        </div>
        <div style={{ marginTop: 28 }}>
          <SkeletonRows count={4} columns={3} />
        </div>
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <div className={styles.page}>
        <StatusState
          tone="danger"
          eyebrow="Project unavailable"
          title={`Could not load ${projectLabel}`}
          hint="Live coordination for this project is temporarily unavailable."
          detail={pollError}
          meta={lastSynced ? `Last synced ${lastSynced}` : 'No successful sync yet'}
          actionLabel="Retry"
          onAction={forceRefresh}
        />
      </div>
    );
  }

  const activeSlots = currentLayout.slots.filter((s) => getWidget(s.id));

  // Detail-drill render. ProjectView mounts the same seven detail
  // components OverviewView mounts, scoped to this project's analytics.
  // Back button reads "Project" so the breadcrumb says "you came from
  // here" not "you came from the cross-project surface". LiveNowView
  // takes liveAgents + locks (built by useProjectData) and a project-
  // scoped scope label for its empty state.
  if (anyOpen) {
    if (live.shifted) {
      return (
        <LiveNowView
          liveAgents={liveAgents}
          locks={locks}
          focusAgentId={focusAgentId}
          initialTab={liveTabParam}
          onBack={closeAll}
          backLabel="Project"
          scopeLabel="in this project"
          onOpenProject={(teamId) => {
            closeAll();
            selectTeam(teamId);
          }}
          onOpenTools={() => {
            closeAll();
            navigate('tools');
          }}
        />
      );
    }
    if (usage.shifted) {
      return (
        <UsageDetailView
          analytics={analytics}
          initialTab={usage.param}
          onBack={usage.close}
          rangeDays={rangeDays}
          onRangeChange={setRangeDays}
          backLabel="Project"
        />
      );
    }
    if (outcomes.shifted) {
      return (
        <OutcomesDetailView
          analytics={analytics}
          initialTab={outcomes.param}
          onBack={outcomes.close}
          rangeDays={rangeDays}
          onRangeChange={setRangeDays}
          backLabel="Project"
        />
      );
    }
    if (activity.shifted) {
      return (
        <ActivityDetailView
          analytics={analytics}
          initialTab={activity.param}
          onBack={activity.close}
          rangeDays={rangeDays}
          onRangeChange={setRangeDays}
          backLabel="Project"
        />
      );
    }
    if (codebase.shifted) {
      return (
        <CodebaseDetailView
          analytics={analytics}
          initialTab={codebase.param}
          onBack={codebase.close}
          rangeDays={rangeDays}
          onRangeChange={setRangeDays}
          backLabel="Project"
        />
      );
    }
    if (tools.shifted) {
      return (
        <ToolsDetailView
          analytics={analytics}
          initialTab={tools.param}
          onBack={tools.close}
          rangeDays={rangeDays}
          onRangeChange={setRangeDays}
          backLabel="Project"
        />
      );
    }
    if (memory.shifted) {
      return (
        <MemoryDetailView
          analytics={analytics}
          initialTab={memory.param}
          onBack={memory.close}
          rangeDays={rangeDays}
          onRangeChange={setRangeDays}
          backLabel="Project"
        />
      );
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.page}>
        <ViewHeader eyebrow="Project" title={activeTeam?.team_name || 'Project'} />

        {/* Global alert chrome - visible across tabs */}
        {conflicts.length > 0 && (
          <button
            type="button"
            className={styles.conflictBanner}
            onClick={() => setActiveTab('activity')}
          >
            <span className={styles.conflictText}>
              {conflicts.length} {conflicts.length === 1 ? 'file' : 'files'} with overlapping edits
            </span>
            <span className={styles.conflictAction}>View</span>
          </button>
        )}

        {/* Tab nav - same StatTabs primitive used by detail-view stat strips */}
        <section className={styles.header}>
          <StatTabs
            tabs={stats}
            tabControl={{ activeTab, setActiveTab, hint, ref: statsRef }}
            tablistLabel="Project sections"
            idPrefix="project"
          />
        </section>

        {/* Customize bar (analytical tabs only) */}
        {isAnalytical && (
          <div className={overviewStyles.rangeRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!isMobile && (
                <CustomizeButton
                  active={catalogOpen}
                  onClick={() => setCatalogOpen(!catalogOpen)}
                  kbd="c"
                />
              )}
              {activeTab === 'activity' && activeTeamId && (
                <button
                  type="button"
                  className={styles.spawnBtn}
                  onClick={() => setShowSpawn((v) => !v)}
                  aria-expanded={showSpawn}
                >
                  {showSpawn ? 'Cancel' : 'Spawn agent'}
                  <span className={styles.spawnBtnArrow}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      {showSpawn ? (
                        <path
                          d="M3 3l6 6M9 3l-6 6"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <path
                          d="M6 2.5v7M3 6.5l3 3 3-3"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </svg>
                  </span>
                </button>
              )}
            </div>
            <RangePills value={rangeDays} onChange={setRangeDays} />
          </div>
        )}

        {/* Inline spawn form (Activity tab only, toggled by the spawn pill) */}
        {activeTab === 'activity' && showSpawn && activeTeamId && (
          <SpawnForm
            teamId={activeTeamId}
            availableTools={availableSpawnTools}
            onClose={() => setShowSpawn(false)}
          />
        )}

        {/* Tab content */}
        <section className={styles.vizArea}>
          {isAnalytical && (
            <div className={styles.vizPanel} role="tabpanel" id={`project-panel-${activeTab}`}>
              <div className={styles.gridBleed}>
                <WidgetGrid
                  slots={activeSlots}
                  renderWidget={renderWidget}
                  onReorder={currentLayout.reorderWidgets}
                  onRemove={currentLayout.removeWidget}
                />
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className={styles.vizPanel} role="tabpanel" id="project-panel-memory">
              <ProjectMemoryTab
                memories={memories}
                memoryBreakdown={memoryBreakdown}
                onDeleteMemory={handleDeleteMemory}
              />
            </div>
          )}
        </section>

        {/* Customize panel (analytical tabs only) */}
        {isAnalytical && (
          <WidgetCatalog
            open={catalogOpen}
            onClose={() => setCatalogOpen(false)}
            widgetIds={currentLayout.widgetIds}
            toggleWidget={currentLayout.toggleWidget}
            resetToDefault={currentLayout.resetToDefault}
            clearAll={currentLayout.clearAll}
            viewScope="project"
          />
        )}
      </div>
      <DragOverlay
        dropAnimation={null}
        modifiers={catalogDragging ? [snapChipToCursor] : undefined}
      >
        {catalogDragging ? (
          <div className={overviewStyles.dragOverlayCard}>
            <span className={overviewStyles.dragOverlayName}>{catalogDragging.name}</span>
          </div>
        ) : sortableDragging ? (
          <div
            className={overviewStyles.dragOverlayWidget}
            style={{ width: sortableDragging.w, height: sortableDragging.h }}
          >
            {renderWidget(sortableDragging.id)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
