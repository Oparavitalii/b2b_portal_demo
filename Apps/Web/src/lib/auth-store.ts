import { create } from 'zustand';

export type UserRole = 'admin' | 'customer';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  companyName: string;
}

interface AuthState {
  user: SessionUser | null;
  accessToken: string | null;
  bootComplete: boolean;
  setSession: (user: SessionUser, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
  markBootComplete: () => void;
}

// ---------------------------------------------------------------------------
// Session hint — a localStorage flag meaning "this browser has logged in
// before, so a refresh-token cookie may exist". AuthHydrator only calls
// /api/auth/refresh on boot when it is present, so anonymous visitors never
// trigger a guaranteed 401. It holds no personal data, only '1'.
// ---------------------------------------------------------------------------
const SESSION_HINT_KEY = 'catalog_session';

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function hasSessionHint(): boolean {
  try {
    return safeStorage()?.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function setSessionHint(): void {
  try {
    safeStorage()?.setItem(SESSION_HINT_KEY, '1');
  } catch {
    // Storage disabled (private mode, quota) — the hint is only an optimisation.
  }
}

function clearSessionHint(): void {
  try {
    safeStorage()?.removeItem(SESSION_HINT_KEY);
  } catch {
    // Ignore.
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  bootComplete: false,
  setSession: (user, accessToken) => {
    setSessionHint();
    set({ user, accessToken });
  },
  setAccessToken: (accessToken) => {
    setSessionHint();
    set({ accessToken });
  },
  clear: () => {
    clearSessionHint();
    set({ user: null, accessToken: null });
  },
  markBootComplete: () => set({ bootComplete: true }),
}));

// Non-hook accessors for the HTTP layer (outside the React tree).
export const getAccessToken = (): string | null =>
  useAuthStore.getState().accessToken;
export const setAccessTokenSync = (token: string): void =>
  useAuthStore.getState().setAccessToken(token);
export const clearAuth = (): void => useAuthStore.getState().clear();

// Narrow an unknown /api/me (or login) payload to the session user.
export function toSessionUser(value: unknown): SessionUser | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const { id, email, role, companyName } = v;
  if (typeof id !== 'string' || typeof email !== 'string') return null;
  if (role !== 'admin' && role !== 'customer') return null;
  return {
    id,
    email,
    role,
    companyName: typeof companyName === 'string' ? companyName : '',
  };
}

/** Where the admin lands: the panel, never the customer catalogue. */
export const ADMIN_HOME = '/admin/zamowienia';
