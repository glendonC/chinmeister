// Fetches per-edit audit log on demand (not polled).
// Used by the Sessions tab in the project view.

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { authActions } from '../lib/stores/auth.js';
import {
  type EditHistory,
  editHistorySchema,
  validateResponse,
  createEmptyEditHistory,
} from '../lib/apiSchemas.js';

interface UseEditHistoryReturn {
  editHistory: EditHistory;
  isLoading: boolean;
  error: string | null;
}

export function useEditHistory(teamId: string | null, days = 7): UseEditHistoryReturn {
  const [editHistory, setEditHistory] = useState<EditHistory>(createEmptyEditHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!teamId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    async function fetchEdits() {
      setIsLoading(true);
      setError(null);
      try {
        const token = authActions.getState().token;
        const raw = await api('GET', `/teams/${teamId}/edits?days=${days}&limit=200`, null, token, {
          signal: controller.signal,
        });
        if (cancelled) return;
        const parsed = validateResponse(editHistorySchema, raw, 'editHistory', {
          fallback: createEmptyEditHistory,
        });
        setEditHistory(parsed);
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message || 'Failed to load edit history');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchEdits();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [teamId, days]);

  return { editHistory, isLoading, error };
}
