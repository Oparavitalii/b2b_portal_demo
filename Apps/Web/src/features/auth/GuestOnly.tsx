import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ADMIN_HOME, useAuthStore } from '@/lib/auth-store';

// Where ProtectedRoute sent the user from (state.from), else home: the
// catalogue for a customer, the panel for the admin.
function returnPath(state: unknown, home: string): string {
  if (!state || typeof state !== 'object' || !('from' in state)) return home;
  const from = (state as { from?: { pathname?: unknown; search?: unknown } })
    .from;
  if (!from || typeof from.pathname !== 'string') return home;
  if (from.pathname.startsWith('/logowanie') || from.pathname === '/')
    return home;
  const search = typeof from.search === 'string' ? from.search : '';
  return from.pathname + search;
}

// Login and registration make no sense for a signed-in user. This is also the
// one place that redirects after a successful login: back to the page the
// user was sent away from, else the catalogue. Waits for AuthHydrator so a
// returning user never sees the form flash.
export function GuestOnly({ children }: { children: ReactNode }) {
  const bootComplete = useAuthStore((s) => s.bootComplete);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!bootComplete) {
    return (
      <Center mih='40vh' aria-busy='true' aria-label='Ładowanie'>
        <Loader color='cdmInk.9' />
      </Center>
    );
  }
  if (user) {
    const home = user.role === 'admin' ? ADMIN_HOME : '/';
    return <Navigate to={returnPath(location.state, home)} replace />;
  }
  return <>{children}</>;
}
