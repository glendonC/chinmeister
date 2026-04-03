import { useMemo } from 'react';
import { usePollingStore } from '../../lib/stores/polling.js';
import type { Member, Lock, HostMetric, Conflict } from '../../lib/apiSchemas.js';
import {
  buildFilesInPlay,
  buildProjectConflicts,
  buildProjectToolSummaries,
  type FileConflict,
  type UsageSummaryEntry,
} from './projectViewState.js';

interface UseProjectAnalyticsReturn {
  locks: Lock[];
  conflicts: FileConflict[];
  filesInPlay: string[];
  toolSummaries: UsageSummaryEntry[];
}

export default function useProjectAnalytics(): UseProjectAnalyticsReturn {
  const contextData = usePollingStore((s) => s.contextData) as Record<string, unknown> | null;

  const members = useMemo<Member[]>(
    () => (contextData?.members as Member[]) ?? [],
    [contextData?.members],
  );
  const locks = useMemo<Lock[]>(() => (contextData?.locks as Lock[]) ?? [], [contextData?.locks]);
  const toolsConfigured = useMemo<HostMetric[]>(
    () => (contextData?.tools_configured as HostMetric[]) ?? [],
    [contextData?.tools_configured],
  );

  const activeAgents = useMemo(
    () => members.filter((member: Member) => member.status === 'active'),
    [members],
  );
  const conflicts = useMemo(
    () => buildProjectConflicts((contextData?.conflicts as Conflict[]) || [], members),
    [contextData?.conflicts, members],
  );
  const filesInPlay: string[] = useMemo(
    () => buildFilesInPlay(activeAgents, locks),
    [activeAgents, locks],
  );
  const toolSummaries: UsageSummaryEntry[] = useMemo(
    () => buildProjectToolSummaries(members, toolsConfigured),
    [members, toolsConfigured],
  );

  return {
    locks,
    conflicts,
    filesInPlay,
    toolSummaries,
  };
}
