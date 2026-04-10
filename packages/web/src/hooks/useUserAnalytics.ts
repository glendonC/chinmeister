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

export function useUserAnalytics(days = 30, enabled = true): UseUserAnalyticsReturn {
  const [analytics, setAnalytics] = useState<UserAnalytics>(createEmptyUserAnalytics);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        const raw = await api('GET', `/me/analytics?days=${days}`, null, token, {
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
  }, [days, enabled]);

  return { analytics, isLoading, error };
}
