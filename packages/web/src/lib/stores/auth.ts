import { type z } from 'zod';
import { createStore, useStore } from 'zustand';
import { api } from '../api.js';
import { userProfileSchema, validateResponse } from '../apiSchemas.js';
import { isDemoActive, getActiveScenarioId } from '../demoMode.js';
import { getDemoData } from '../demo/index.js';

// XSS surface: the auth token sits in localStorage so it survives reloads,
// but any script that runs in this origin can read it. Migrating to an
// in-memory token plus a refresh-on-load flow is the next step. Until then,
// the HTTPS guard below blocks reads/writes on insecure origins so the
// token cannot leak via mixed content.
const TOKEN_KEY = 'chinmeister_token';
// Synthetic token used when demo is active and no real token is in storage.
// The api() call is bypassed entirely on the demo path, so the value never
// reaches the wire - it's just a non-null marker so the App boot flow
// proceeds past its `if (!t)` guard into authenticate().
const DEMO_TOKEN = '__demo__';

/**
 * Token storage is allowed only on https or local development origins. On
 * any other origin the read/write is refused so the token cannot be sniffed
 * over plaintext or leaked via mixed content.
 */
function isSecureOrigin(): boolean {
  if (typeof window === 'undefined' || !window.location) return true;
  const { protocol, hostname } = window.location;
  if (protocol === 'https:') return true;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function readToken(): string | null {
  if (!isSecureOrigin()) return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(value: string): void {
  if (!isSecureOrigin()) return;
  try {
    localStorage.setItem(TOKEN_KEY, value);
  } catch {
    // Storage may be disabled (e.g. private browsing); session-only auth still works.
  }
}

function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

type UserProfile = z.infer<typeof userProfileSchema>;

// Inflight deduplication: if two concurrent authenticate() calls fire,
// the second awaits the first's promise instead of starting a new one.
// Same pattern as packages/mcp/lib/api.ts inflightRefresh.
let inflightAuth: Promise<boolean> | null = null;

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  sessionExpired: boolean;
  readTokenFromHash: () => string | null;
  getStoredToken: () => string | null;
  authenticate: (t: string) => Promise<boolean>;
  logout: () => void;
  expireSession: () => void;
}

const authStore = createStore<AuthState>((set) => ({
  token: null,
  user: null,
  sessionExpired: false,

  readTokenFromHash() {
    const hash = window.location.hash;
    if (!hash.includes('token=')) return null;
    const match = hash.match(/token=([^&]+)/);
    if (!match) return null;
    window.history.replaceState(null, '', window.location.pathname);
    return match[1];
  },

  getStoredToken() {
    const stored = readToken();
    if (stored) return stored;
    // Demo mode without a real token: hand back a synthetic so the App
    // boot path proceeds into authenticate(), which will short-circuit on
    // the demo path. This lets ?demo work for first-time visitors who
    // never authenticated.
    if (isDemoActive()) return DEMO_TOKEN;
    return null;
  },

  async authenticate(t: string) {
    if (inflightAuth) return inflightAuth;

    inflightAuth = (async () => {
      set({ token: t, sessionExpired: false });
      try {
        // Demo path: skip the API and inject the scenario's user. Don't
        // touch localStorage so toggling demo off restores any real token.
        if (isDemoActive()) {
          const me = getDemoData(getActiveScenarioId()).me;
          set({ user: me });
          return true;
        }
        const rawUser = await api('GET', '/me', null, t);
        const userData = validateResponse(userProfileSchema, rawUser, 'me', {
          throwOnError: true,
        }) as UserProfile;
        set({ user: userData });
        writeToken(t);
        return true;
      } catch (err) {
        set({ token: null, user: null });
        clearToken();
        throw err;
      }
    })().finally(() => {
      inflightAuth = null;
    });

    return inflightAuth;
  },

  logout() {
    set({ token: null, user: null, sessionExpired: false });
    clearToken();
  },

  expireSession() {
    set({ token: null, user: null, sessionExpired: true });
    clearToken();
  },
}));

// Re-evaluate auth on demo toggle so the sidebar/profile pill reflects the
// active mode without a page reload. Three branches:
//   - real token in storage → re-run authenticate (real path off, demo path on)
//   - no real token, demo just turned on → authenticate with the synthetic
//   - no real token, demo just turned off → drop to unauthenticated so the
//     boot screen state is honest about there being no real session.
//
// The function-shape check matters: jsdom-style test stubs sometimes provide
// a partial `window` object without addEventListener, and we don't want
// module evaluation to crash in that case.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('chinmeister:demo-scenario-changed', () => {
    const stored = readToken();
    if (stored) {
      authStore
        .getState()
        .authenticate(stored)
        .catch(() => {});
    } else if (isDemoActive()) {
      authStore
        .getState()
        .authenticate(DEMO_TOKEN)
        .catch(() => {});
    } else {
      authStore.setState({ token: null, user: null });
    }
  });
}

export function useAuthStore<T>(selector: (state: AuthState) => T): T {
  return useStore(authStore, selector);
}

export const authActions = {
  getState: (): AuthState => authStore.getState(),
  authenticate: (t: string): Promise<boolean> => authStore.getState().authenticate(t),
  logout: (): void => authStore.getState().logout(),
  expireSession: (): void => authStore.getState().expireSession(),
  readTokenFromHash: (): string | null => authStore.getState().readTokenFromHash(),
  getStoredToken: (): string | null => authStore.getState().getStoredToken(),
  subscribe: authStore.subscribe,

  updateUser(updates: Partial<UserProfile>): void {
    const current = authStore.getState().user;
    if (current) authStore.setState({ user: { ...current, ...updates } });
  },
};
