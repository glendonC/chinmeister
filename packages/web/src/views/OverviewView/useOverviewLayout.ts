import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { DEFAULT_WIDGET_IDS } from './widget-catalog.js';

const STORAGE_KEY = 'chinwag:overview-layout';

function loadLayout(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) {
        return parsed;
      }
    }
  } catch {
    // Ignore corrupt storage
  }
  return DEFAULT_WIDGET_IDS;
}

function saveLayout(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage quota
  }
}

export function useOverviewLayout() {
  const [widgetIds, setWidgetIdsInner] = useState<string[]>(loadLayout);

  const addWidget = useCallback((id: string) => {
    setWidgetIdsInner((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveLayout(next);
      return next;
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgetIdsInner((prev) => {
      const next = prev.filter((w) => w !== id);
      saveLayout(next);
      return next;
    });
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setWidgetIdsInner((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      saveLayout(next);
      return next;
    });
  }, []);

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setWidgetIdsInner((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      saveLayout(next);
      return next;
    });
  }, []);

  const moveUp = useCallback((id: string) => {
    setWidgetIdsInner((prev) => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      saveLayout(next);
      return next;
    });
  }, []);

  const moveDown = useCallback((id: string) => {
    setWidgetIdsInner((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      saveLayout(next);
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    saveLayout(DEFAULT_WIDGET_IDS);
    setWidgetIdsInner(DEFAULT_WIDGET_IDS);
  }, []);

  const setWidgetIds: Dispatch<SetStateAction<string[]>> = useCallback((action) => {
    setWidgetIdsInner((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      saveLayout(next);
      return next;
    });
  }, []);

  return {
    widgetIds,
    setWidgetIds,
    addWidget,
    removeWidget,
    toggleWidget,
    reorder,
    moveUp,
    moveDown,
    resetToDefault,
  };
}
