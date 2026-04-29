// Fetches the extended team analytics payload on demand (not polled).
// Used by the Analytics tab in ProjectView.

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { authActions } from '../lib/stores/auth.js';
import { createEmptyAnalytics } from '../lib/demo/empty.js';
import { getDemoData } from '../lib/demo/index.js';
import { useDemoScenario } from './useDemoScenario.js';
import { type UserAnalytics, userAnalyticsSchema, validateResponse } from '../lib/apiSchemas.js';

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
  const demo = useDemoScenario();
  const [analytics, setAnalytics] = useState<UserAnalytics>(() =>
    demo.active ? getDemoData(demo.scenarioId).analytics : createEmptyAnalytics(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (demo.active) {
      setAnalytics(getDemoData(demo.scenarioId).analytics);
      setIsLoading(false);
      setError(null);
      return;
    }
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
  }, [teamId, days, enabled, demo.active, demo.scenarioId]);

  return { analytics, isLoading, error };
}
