import { createStore, useStore } from 'zustand';
import { api } from '../api.js';

const TOKEN_KEY = 'chinwag_token';

const authStore = createStore((set, get) => ({
  token: null,
  user: null,

  readTokenFromHash() {
    const hash = window.location.hash;
    if (!hash.includes('token=')) return null;
    const match = hash.match(/token=([^&]+)/);
    if (!match) return null;
    history.replaceState(null, '', window.location.pathname);
    return match[1];
  },

  getStoredToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  async authenticate(t) {
    set({ token: t });
    try {
      const userData = await api('GET', '/me', null, t);
      set({ user: userData });
      localStorage.setItem(TOKEN_KEY, t);
      return true;
    } catch (err) {
      set({ token: null, user: null });
      localStorage.removeItem(TOKEN_KEY);
      throw err;
    }
  },

  logout() {
    set({ token: null, user: null });
    localStorage.removeItem(TOKEN_KEY);
  },
}));

export function useAuthStore(selector) {
  return useStore(authStore, selector);
}

export const authActions = {
  getState: () => authStore.getState(),
  authenticate: (t) => authStore.getState().authenticate(t),
  logout: () => authStore.getState().logout(),
  readTokenFromHash: () => authStore.getState().readTokenFromHash(),
  getStoredToken: () => authStore.getState().getStoredToken(),
  subscribe: authStore.subscribe,

  updateUser(updates) {
    const current = authStore.getState().user;
    if (current) authStore.setState({ user: { ...current, ...updates } });
  },
};
