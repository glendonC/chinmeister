// Fetches team analytics data on demand (not polled).
// Used by Sessions tab (basic) and Analytics tab (extended) in the project view.

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { authActions } from '../lib/stores/auth.js';
import {
  type TeamAnalytics,
  type UserAnalytics,
  teamAnalyticsSchema,
  userAnalyticsSchema,
  validateResponse,
  createEmptyAnalytics,
  createEmptyUserAnalytics,
} from '../lib/apiSchemas.js';

interface UseTeamAnalyticsReturn {
  analytics: TeamAnalytics;
  isLoading: boolean;
  error: string | null;
}

export function useTeamAnalytics(teamId: string | null, days = 30): UseTeamAnalyticsReturn {
  const [analytics, setAnalytics] = useState<TeamAnalytics>(createEmptyAnalytics);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!teamId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    async function fetchAnalytics() {
      setIsLoading(true);
      setError(null);
      try {
        const token = authActions.getState().token;
        const raw = await api('GET', `/teams/${teamId}/analytics?days=${days}`, null, token, {
          signal: controller.signal,
        });
        if (cancelled) return;
        const parsed = validateResponse(teamAnalyticsSchema, raw, 'analytics', {
          fallback: createEmptyAnalytics,
        });
        setAnalytics(parsed);
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message || 'Failed to load analytics');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAnalytics();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [teamId, days]);

  return { analytics, isLoading, error };
}

interface UseTeamExtendedAnalyticsReturn {
  analytics: UserAnalytics;
  isLoading: boolean;
  error: string | null;
}

export function useTeamExtendedAnalytics(
  teamId: string | null,
  days = 30,
  enabled = true,
): UseTeamExtendedAnalyticsReturn {
  const [analytics, setAnalytics] = useState<UserAnalytics>(createEmptyUserAnalytics);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!teamId || !enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    async function fetchAnalytics() {
      setIsLoading(true);
      setError(null);
      try {
        const token = authActions.getState().token;
        const raw = await api(
          'GET',
          `/teams/${teamId}/analytics?days=${days}&extended=1`,
          null,
          token,
          { signal: controller.signal },
        );
        if (cancelled) return;
        const parsed = validateResponse(userAnalyticsSchema, raw, 'team-extended-analytics', {
          fallback: createEmptyUserAnalytics,
        });
        setAnalytics(parsed);
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message || 'Failed to load analytics');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAnalytics();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [teamId, days, enabled]);

  return { analytics, isLoading, error };
}
