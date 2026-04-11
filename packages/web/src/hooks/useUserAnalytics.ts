// Fetches cross-project user analytics on demand (not polled).
// Used by Workflow and Performance tabs in the Overview.

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { authActions } from '../lib/stores/auth.js';
import {
  type UserAnalytics,
  userAnalyticsSchema,
  validateResponse,
  createEmptyUserAnalytics,
} from '../lib/apiSchemas.js';

interface UseUserAnalyticsReturn {
  analytics: UserAnalytics;
  isLoading: boolean;
  error: string | null;
}

export function useUserAnalytics(
  days = 30,
  enabled = true,
  teamIds?: string[],
): UseUserAnalyticsReturn {
  const [analytics, setAnalytics] = useState<UserAnalytics>(createEmptyUserAnalytics);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Stable dep key so effect doesn't re-fire on array reference changes
  const teamKey = teamIds?.slice().sort().join(',') ?? '';

  useEffect(() => {
    if (!enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    async function fetchAnalytics() {
      setIsLoading(true);
      setError(null);
      try {
        const token = authActions.getState().token;
        let url = `/me/analytics?days=${days}`;
        if (teamKey) url += `&team_ids=${teamKey}`;
        const raw = await api('GET', url, null, token, {
          signal: controller.signal,
        });
        if (cancelled) return;
        const parsed = validateResponse(userAnalyticsSchema, raw, 'user-analytics', {
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
  }, [days, enabled, teamKey]);

  return { analytics, isLoading, error };
}
