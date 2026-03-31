import { useEffect, useState } from 'react';
import { api } from './api.js';

let cachedCatalog = null;
let cachedCategories = null;
let cachedEvaluations = null;
let inflightRequest = null;

function getCachedState() {
  return {
    catalog: cachedCatalog || [],
    categories: cachedCategories || {},
    evaluations: cachedEvaluations || [],
    loading: cachedCatalog == null,
    error: null,
  };
}

/** Map a directory evaluation to the old catalog shape for backwards compat. */
function evaluationToCatalogItem(ev) {
  return {
    id: ev.id,
    name: ev.name,
    category: ev.category,
    description: ev.tagline || '',
    featured: ev.integration_tier === 'connected',
    installCmd: ev.metadata?.install_command || null,
    mcp_support: ev.mcp_support,
  };
}

export function useToolCatalog(token) {
  const [state, setState] = useState(getCachedState);

  useEffect(() => {
    let cancelled = false;

    if (cachedCatalog != null) {
      setState(getCachedState());
      return () => {
        cancelled = true;
      };
    }

    if (!inflightRequest) {
      inflightRequest = api('GET', '/tools/directory?limit=200', null, token)
        .then((data) => {
          cachedEvaluations = data.evaluations || [];
          cachedCategories = data.categories || {};
          cachedCatalog = cachedEvaluations.map(evaluationToCatalogItem);
          return { catalog: cachedCatalog, categories: cachedCategories, evaluations: cachedEvaluations };
        })
        .catch(() =>
          // Fallback to old catalog endpoint if directory isn't deployed yet
          api('GET', '/tools/catalog', null, token).then((data) => {
            cachedCatalog = data.tools || [];
            cachedCategories = data.categories || {};
            cachedEvaluations = [];
            return { catalog: cachedCatalog, categories: cachedCategories, evaluations: cachedEvaluations };
          })
        )
        .finally(() => {
          inflightRequest = null;
        });
    }

    inflightRequest
      .then(({ catalog, categories, evaluations }) => {
        if (!cancelled) {
          setState({
            catalog,
            categories,
            evaluations,
            loading: false,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            catalog: [],
            categories: {},
            evaluations: [],
            loading: false,
            error,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
