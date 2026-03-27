import { useEffect, useState } from 'react';
import { api } from './api.js';

let cachedCatalog = null;
let cachedCategories = null;
let inflightRequest = null;

function getCachedState() {
  return {
    catalog: cachedCatalog || [],
    categories: cachedCategories || {},
    loading: cachedCatalog == null,
    error: null,
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
      inflightRequest = api('GET', '/tools/catalog', null, token)
        .then((data) => {
          cachedCatalog = data.tools || [];
          cachedCategories = data.categories || {};
          return {
            catalog: cachedCatalog,
            categories: cachedCategories,
          };
        })
        .finally(() => {
          inflightRequest = null;
        });
    }

    inflightRequest
      .then(({ catalog, categories }) => {
        if (!cancelled) {
          setState({
            catalog,
            categories,
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
