import { useMemo } from 'react';
import { usePollingStore } from '../../lib/stores/polling.js';
import { MAX_DISPLAY_SESSIONS } from '../../lib/constants.js';
import {
  buildFilesTouched,
  countLiveSessions,
  selectRecentSessions,
  sumSessionEdits,
} from './projectViewState.js';
import type { Session } from '../../lib/apiSchemas.js';

interface UseProjectSessionsReturn {
  allSessions: Session[];
  sessions: Session[];
  filesTouched: string[];
  filesTouchedCount: number;
  sessionEditCount: number;
  liveSessionCount: number;
}

export default function useProjectSessions(): UseProjectSessionsReturn {
  const contextData = usePollingStore((s) => s.contextData);

  const allSessions = useMemo(
    () =>
      selectRecentSessions(
        contextData?.recentSessions?.length
          ? contextData.recentSessions
          : (contextData?.sessions ?? []),
      ),
    [contextData],
  );
  const sessions = allSessions.slice(0, MAX_DISPLAY_SESSIONS);
  const filesTouched: string[] = useMemo(() => buildFilesTouched(allSessions), [allSessions]);
  const sessionEditCount: number = useMemo(() => sumSessionEdits(allSessions), [allSessions]);
  const filesTouchedCount = filesTouched.length;
  const liveSessionCount: number = useMemo(() => countLiveSessions(allSessions), [allSessions]);

  return {
    allSessions,
    sessions,
    filesTouched,
    filesTouchedCount,
    sessionEditCount,
    liveSessionCount,
  };
}
