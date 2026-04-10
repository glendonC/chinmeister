// Fetches individual session records for swimlane timeline visualization.
// Returns raw session objects with start/end times, tool, edits, files, outcome.

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { authActions } from '../lib/stores/auth.js';

export interface TimelineSession {
  id: string;
  handle: string;
  host_tool: string;
  agent_model?: string | null;
  started_at: string;
  ended_at: string | null;
  edit_count: number;
  files_touched: string[];
  outcome?: string | null;
  outcome_summary?: string | null;
  lines_added: number;
  lines_removed: number;
  duration_minutes: number;
  team_id: string;
  team_name: string | null;
}

export interface TimelineTotals {
  sessions: number;
  edits: number;
  lines_added: number;
  lines_removed: number;
  tools: string[];
}

interface UseSessionTimelineReturn {
  sessions: TimelineSession[];
  totals: TimelineTotals;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_TOTALS: TimelineTotals = {
  sessions: 0,
  edits: 0,
  lines_added: 0,
  lines_removed: 0,
  tools: [],
};

export function useSessionTimeline(from: string, to: string): UseSessionTimelineReturn {
  const [sessions, setSessions] = useState<TimelineSession[]>([]);
  const [totals, setTotals] = useState<TimelineTotals>(EMPTY_TOTALS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    async function fetchSessions() {
      setIsLoading(true);
      setError(null);
      try {
        const token = authActions.getState().token;
        const raw = await api('GET', `/me/sessions?from=${from}&to=${to}`, null, token, {
          signal: controller.signal,
        });
        if (cancelled) return;
        const data = raw as { sessions?: TimelineSession[]; totals?: TimelineTotals };
        setSessions(data.sessions || []);
        setTotals(data.totals || EMPTY_TOTALS);
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message || 'Failed to load sessions');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchSessions();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [from, to]);

  return { sessions, totals, isLoading, error };
}
