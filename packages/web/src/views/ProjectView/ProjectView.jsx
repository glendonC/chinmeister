import { useMemo, useCallback, useState } from 'react';
import { usePollingStore } from '../../lib/stores/polling.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { teamActions } from '../../lib/stores/teams.js';
import {
  buildLiveToolMix,
  buildUsageEntries,
} from '../../lib/toolAnalytics.js';
import ActivityTimeline from '../../components/ActivityTimeline/ActivityTimeline.jsx';
import ViewHeader from '../../components/ViewHeader/ViewHeader.jsx';
import {
  buildFilesInPlay,
  buildFilesTouched,
  buildMemoryBreakdown,
  buildProjectConflicts,
  buildProjectToolSummaries,
  countLiveSessions,
  selectRecentSessions,
  sumSessionEdits,
} from './projectViewState.js';
import {
  ProjectLiveTab,
  ProjectMemoryTab,
  ProjectSessionsTab,
  ProjectToolsTab,
} from './ProjectTabParts.jsx';
import styles from './ProjectView.module.css';

export default function ProjectView() {
  const contextData = usePollingStore((s) => s.contextData);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const teams = useTeamStore((s) => s.teams);
  const [activeViz, setActiveViz] = useState('live');

  const members = contextData?.members || [];
  const memories = contextData?.memories || [];
  const allSessions = useMemo(
    () => selectRecentSessions(contextData?.recentSessions || []),
    [contextData]
  );
  const sessions = allSessions.slice(0, 8);
  const locks = contextData?.locks || [];
  const toolsConfigured = contextData?.tools_configured || [];
  const usage = contextData?.usage || {};
  const activeTeam = teams.find((team) => team.team_id === activeTeamId) || null;

  const activeAgents = useMemo(
    () => members.filter((member) => member.status === 'active'),
    [members]
  );
  const offlineAgents = useMemo(
    () => members.filter((member) => member.status === 'offline'),
    [members]
  );
  const sortedAgents = useMemo(() => [...activeAgents, ...offlineAgents], [activeAgents, offlineAgents]);
  const liveToolMix = useMemo(() => buildLiveToolMix(members), [members]);
  const usageEntries = useMemo(() => buildUsageEntries(usage), [usage]);
  const conflicts = useMemo(
    () => buildProjectConflicts(contextData?.conflicts || [], members),
    [contextData, members]
  );
  const filesInPlay = useMemo(() => buildFilesInPlay(activeAgents, locks), [activeAgents, locks]);
  const filesTouched = useMemo(() => buildFilesTouched(allSessions), [allSessions]);
  const memoryBreakdown = useMemo(() => buildMemoryBreakdown(memories), [memories]);
  const sessionEditCount = useMemo(() => sumSessionEdits(allSessions), [allSessions]);
  const filesTouchedCount = filesTouched.length;
  const liveSessionCount = useMemo(() => countLiveSessions(allSessions), [allSessions]);
  const toolSummaries = useMemo(
    () => buildProjectToolSummaries(members, toolsConfigured),
    [members, toolsConfigured]
  );

  const handleUpdateMemory = useCallback(async (id, text, tags) => {
    if (!activeTeamId) return;
    await teamActions.updateMemory(activeTeamId, id, text, tags);
  }, [activeTeamId]);

  const handleDeleteMemory = useCallback(async (id) => {
    if (!activeTeamId) return;
    await teamActions.deleteMemory(activeTeamId, id);
  }, [activeTeamId]);

  const stats = [
    { id: 'live', label: 'Agents', value: activeAgents.length, tone: activeAgents.length > 0 ? 'accent' : '' },
    { id: 'memory', label: 'Memory', value: memories.length, tone: '' },
    { id: 'sessions', label: 'Edits / 24h', value: sessionEditCount, tone: '' },
    { id: 'tools', label: 'Tools', value: toolSummaries.length, tone: '' },
  ];

  return (
    <div className={styles.page}>
      <ViewHeader eyebrow="Project" title={activeTeam?.team_name || 'Project'} />

      {conflicts.length > 0 && (
        <button
          type="button"
          className={styles.conflictBanner}
          onClick={() => setActiveViz('live')}
        >
          <span className={styles.conflictText}>
            {conflicts.length} {conflicts.length === 1 ? 'file' : 'files'} with overlapping edits
          </span>
          <span className={styles.conflictAction}>View</span>
        </button>
      )}

      <section className={styles.header}>
        <div className={styles.statsRow}>
          {stats.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.statButton} ${activeViz === s.id ? styles.statActive : ''}`}
              onClick={() => setActiveViz(s.id)}
            >
              <span className={styles.statLabel}>{s.label}</span>
              <span className={`${styles.statValue} ${s.tone === 'accent' ? styles.statAccent : ''}`}>
                {s.value}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.activitySection}>
        <ActivityTimeline sessions={allSessions} liveCount={activeAgents.length} />
      </section>

      <section className={styles.vizArea}>
        {activeViz === 'live' && (
          <div className={styles.vizPanel}>
            <ProjectLiveTab
              sortedAgents={sortedAgents}
              offlineAgents={offlineAgents}
              conflicts={conflicts}
              filesInPlay={filesInPlay}
              locks={locks}
              liveToolMix={liveToolMix}
            />
          </div>
        )}

        {activeViz === 'memory' && (
          <div className={styles.vizPanel}>
            <ProjectMemoryTab
              memories={memories}
              memoryBreakdown={memoryBreakdown}
              onUpdateMemory={handleUpdateMemory}
              onDeleteMemory={handleDeleteMemory}
            />
          </div>
        )}

        {activeViz === 'sessions' && (
          <div className={styles.vizPanel}>
            <ProjectSessionsTab
              sessions={sessions}
              sessionEditCount={sessionEditCount}
              filesTouched={filesTouched}
              filesTouchedCount={filesTouchedCount}
              liveSessionCount={liveSessionCount}
            />
          </div>
        )}

        {activeViz === 'tools' && (
          <div className={styles.vizPanel}>
            <ProjectToolsTab
              toolSummaries={toolSummaries}
              conflicts={conflicts}
              filesInPlay={filesInPlay}
              locks={locks}
              usageEntries={usageEntries}
            />
          </div>
        )}
      </section>
    </div>
  );
}
