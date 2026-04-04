import { useMemo } from 'react';
import { usePollingStore } from '../../lib/stores/polling.js';
import { buildLiveToolMix, type ToolMixEntry } from '../../lib/toolAnalytics.js';
import type { Member } from '../../lib/apiSchemas.js';

interface UseProjectMembersReturn {
  members: Member[];
  activeAgents: Member[];
  offlineAgents: Member[];
  sortedAgents: Member[];
  liveToolMix: ToolMixEntry[];
}

export default function useProjectMembers(): UseProjectMembersReturn {
  const contextData = usePollingStore((s) => s.contextData);

  const members = useMemo<Member[]>(() => contextData?.members ?? [], [contextData?.members]);

  const activeAgents = useMemo(
    () => members.filter((member: Member) => member.status === 'active'),
    [members],
  );
  const offlineAgents = useMemo(
    () => members.filter((member: Member) => member.status === 'offline'),
    [members],
  );
  const sortedAgents = useMemo(
    () => [...activeAgents, ...offlineAgents],
    [activeAgents, offlineAgents],
  );
  const liveToolMix = useMemo(() => buildLiveToolMix(members), [members]);

  return {
    members,
    activeAgents,
    offlineAgents,
    sortedAgents,
    liveToolMix,
  };
}
