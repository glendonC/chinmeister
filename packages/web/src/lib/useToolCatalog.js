import { useEffect } from 'react';
import { useToolCatalogStore, toolCatalogActions } from './stores/toolCatalog.js';

/**
 * Hook that returns the tool catalog data.
 * Triggers a fetch on mount (deduped + token-aware via the Zustand store).
 * API is unchanged: { catalog, categories, evaluations, loading, error }.
 */
export function useToolCatalog(token) {
  const catalog = useToolCatalogStore((s) => s.catalog);
  const categories = useToolCatalogStore((s) => s.categories);
  const evaluations = useToolCatalogStore((s) => s.evaluations);
  const loading = useToolCatalogStore((s) => s.loading);
  const error = useToolCatalogStore((s) => s.error);

  useEffect(() => {
    if (token) {
      toolCatalogActions.fetchCatalog(token);
    }
  }, [token]);

  return { catalog, categories, evaluations, loading, error };
}
