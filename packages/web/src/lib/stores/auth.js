import { createStore, useStore } from 'zustand';
import { api } from '../api.js';

const TOKEN_KEY = 'chinwag_token';

const authStore = createStore((set, get) => ({
  token: null,
  user: null,

  /**
   * Read a token from the URL hash fragment (#token=xxx).
   * Clears the hash after reading.
   */
  readTokenFromHash() {
    const hash = window.location.hash;
    if (!hash.includes('token=')) return null;
    const match = hash.match(/token=([^&]+)/);
    if (!match) return null;
    history.replaceState(null, '', window.location.pathname);
    return match[1];
  },

  /** Get a previously stored token from sessionStorage. */
  getStoredToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  },

  /**
   * Authenticate with a token. Sets token + user on success.
   * Throws on failure (clears token).
   */
  async authenticate(t) {
    set({ token: t });
    try {
      const userData = await api('GET', '/me', null, t);
      set({ user: userData });
      sessionStorage.setItem(TOKEN_KEY, t);
      return true;
    } catch (err) {
      set({ token: null, user: null });
      sessionStorage.removeItem(TOKEN_KEY);
      throw err;
    }
  },

  /** Sign out. Clears all auth state. */
  logout() {
    set({ token: null, user: null });
    sessionStorage.removeItem(TOKEN_KEY);
  },
}));

/** React hook — use inside components */
export function useAuthStore(selector) {
  return useStore(authStore, selector);
}

/** Direct access — use outside components (stores, polling, etc.) */
export const authActions = {
  getState: () => authStore.getState(),
  authenticate: (t) => authStore.getState().authenticate(t),
  logout: () => authStore.getState().logout(),
  readTokenFromHash: () => authStore.getState().readTokenFromHash(),
  getStoredToken: () => authStore.getState().getStoredToken(),
  subscribe: authStore.subscribe,
};
