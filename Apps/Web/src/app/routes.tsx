import {
  createBrowserRouter,
  Outlet,
  type RouteObject,
} from 'react-router-dom';

import { AppLayout } from '@/components/Layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { NotFoundPage } from '@/features/pages/NotFoundPage';
import { featureRoutes } from '@/lib/feature-routes';

// Public pages owned by this shell (R-13 Kontakt, R-26 legal pages, B-21 API docs).
// Lazy: legal texts are long and only rarely opened.
const pageRoutes: RouteObject[] = [
  {
    path: '/kontakt',
    lazy: async () => ({
      Component: (await import('@/features/pages/KontaktPage')).KontaktPage,
    }),
  },
  {
    path: '/polityka-prywatnosci',
    lazy: async () => ({
      Component: (await import('@/features/pages/PrivacyPage')).PrivacyPage,
    }),
  },
  {
    path: '/dokumentacja-api',
    lazy: async () => ({
      Component: (await import('@/features/pages/ApiDocsPage')).ApiDocsPage,
    }),
  },
  {
    path: '/regulamin',
    lazy: async () => ({
      Component: (await import('@/features/pages/TermsPage')).TermsPage,
    }),
  },
];

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    // D-02: lazy routes hydrate after the first paint; render nothing meanwhile
    // (AppLayout's own loaders take over) instead of React Router's warning.
    HydrateFallback: () => null,
    children: [
      // Public: auth pages from features + Kontakt and legal pages.
      ...featureRoutes.public,
      ...pageRoutes,
      // Customer + admin: catalogue, cart, account, orders (R-17: behind login).
      {
        element: (
          <ProtectedRoute roles={['customer', 'admin']}>
            <Outlet />
          </ProtectedRoute>
        ),
        children: featureRoutes.customer,
      },
      // Admin panel.
      {
        element: (
          <ProtectedRoute roles={['admin']}>
            <Outlet />
          </ProtectedRoute>
        ),
        children: featureRoutes.admin,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
