import { type ReactNode, useEffect, useRef } from 'react';

import { hasSessionHint, toSessionUser, useAuthStore } from '@/lib/auth-store';
import { apiFetch, performTokenRefresh } from '@/lib/http';

// On boot: when this browser has a session hint, exchange the httpOnly refresh
// cookie for an access token (POST /api/auth/refresh), then load the user
// (GET /api/me). Children render immediately; ProtectedRoute waits for
// `bootComplete` before deciding.
export function AuthHydrator({ children }: { children: ReactNode }) {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    void (async () => {
      const store = useAuthStore.getState();
      if (!hasSessionHint()) {
        store.markBootComplete();
        return;
      }
      try {
        const outcome = await performTokenRefresh();
        if (outcome === 'ok') {
          const user = toSessionUser(await apiFetch<unknown>('/me'));
          const token = useAuthStore.getState().accessToken;
          if (user && token) {
            useAuthStore.getState().setSession(user, token);
          } else {
            useAuthStore.getState().clear();
          }
        }
      } catch {
        useAuthStore.getState().clear();
      } finally {
        useAuthStore.getState().markBootComplete();
      }
    })();
  }, []);

  return <>{children}</>;
}
