import { useMemo, useCallback, useState } from 'react';
import { usePollingStore } from '../../lib/stores/polling.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { teamActions } from '../../lib/stores/teams.js';
import {
  buildLiveToolMix,
  buildUsageEntries,
} from '../../lib/toolAnalytics.js';
import ActivityTimeline from '../../components/ActivityTimeline/ActivityTimeline.jsx';
import StatCard from '../../components/StatCard/StatCard.jsx';
import Tabs from '../../components/Tabs/Tabs.jsx';
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
  const [activeTab, setActiveTab] = useState('live');

  const members = contextData?.members || [];
  const memories = contextData?.memories || [];
  const allSessions = useMemo(
    () => selectRecentSessions(contextData?.recentSessions || []),
    [contextData]
  );
  const sessions = allSessions.slice(0, 8);
  const locks = contextData?.locks || [];
  const messages = contextData?.messages || [];
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

  const tabs = [
    { id: 'live', label: 'Live', badge: activeAgents.length || null },
    { id: 'knowledge', label: 'Memory', badge: memories.length || null },
    { id: 'history', label: 'Sessions', badge: allSessions.length || null },
    { id: 'tools', label: 'Tools', badge: toolSummaries.length || null },
  ];

  const handleUpdateMemory = useCallback(async (id, text, tags) => {
    if (!activeTeamId) return;
    await teamActions.updateMemory(activeTeamId, id, text, tags);
  }, [activeTeamId]);

  const handleDeleteMemory = useCallback(async (id) => {
    if (!activeTeamId) return;
    await teamActions.deleteMemory(activeTeamId, id);
  }, [activeTeamId]);

  const handleSendMessage = useCallback(async (text) => {
    if (!activeTeamId) return;
    await teamActions.sendMessage(activeTeamId, text);
  }, [activeTeamId]);

  return (
    <div className={styles.page}>
      <ViewHeader eyebrow="Project" title={activeTeam?.team_name || 'Project'} />

      <div className={styles.hero}>
        <StatCard
          label="Live agents"
          value={activeAgents.length}
          tone={activeAgents.length > 0 ? 'accent' : 'default'}
        />
        <StatCard
          label="Conflicts"
          value={conflicts.length}
          tone={conflicts.length > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Memory"
          value={memories.length}
          tone={memories.length > 0 ? 'success' : 'default'}
        />
        <StatCard label="Sessions / 24h" value={allSessions.length} />
      </div>

      <section className={styles.timelineSection}>
        <div className={styles.timelineCopy}>
          <span className={styles.timelineLabel}>24h sessions</span>
          <p className={styles.timelineMeta}>{allSessions.length} reported</p>
        </div>
        <ActivityTimeline sessions={allSessions} liveCount={activeAgents.length} />
      </section>

      <Tabs tabs={tabs} active={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'live' && (
          <ProjectLiveTab
            sortedAgents={sortedAgents}
            offlineAgents={offlineAgents}
            conflicts={conflicts}
            filesInPlay={filesInPlay}
            locks={locks}
            liveToolMix={liveToolMix}
          />
        )}

        {activeTab === 'knowledge' && (
          <ProjectMemoryTab
            memories={memories}
            memoryBreakdown={memoryBreakdown}
            messages={messages}
            onUpdateMemory={handleUpdateMemory}
            onDeleteMemory={handleDeleteMemory}
            onSendMessage={handleSendMessage}
          />
        )}

        {activeTab === 'history' && (
          <ProjectSessionsTab
            sessions={sessions}
            sessionEditCount={sessionEditCount}
            filesTouched={filesTouched}
            filesTouchedCount={filesTouchedCount}
            liveSessionCount={liveSessionCount}
          />
        )}

        {activeTab === 'tools' && (
          <ProjectToolsTab
            toolSummaries={toolSummaries}
            conflicts={conflicts}
            filesInPlay={filesInPlay}
            locks={locks}
            usageEntries={usageEntries}
          />
        )}
      </Tabs>
    </div>
  );
}
