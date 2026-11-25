import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { type UserRole, useAuthStore } from '@/lib/auth-store';

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: UserRole[];
}

// Guest -> /logowanie (with `from` so login can return); wrong role -> '/'.
export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
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
  if (!user)
    return <Navigate to='/logowanie' replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to='/' replace />;
  return <>{children}</>;
}
