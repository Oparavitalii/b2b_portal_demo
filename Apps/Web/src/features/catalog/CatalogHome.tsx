import { Navigate } from 'react-router-dom';

import { ADMIN_HOME, useAuthStore } from '@/lib/auth-store';

import { CatalogPage } from './CatalogPage';

// '/' is the customer catalogue; the admin has only the panel.
export function CatalogHome() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  return isAdmin ? <Navigate to={ADMIN_HOME} replace /> : <CatalogPage />;
}
