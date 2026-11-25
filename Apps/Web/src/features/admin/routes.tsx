import type { RouteObject } from 'react-router-dom';

// Admin panel (R-02, R-25, received orders). Collected by lib/feature-routes.ts into the
// admin-only ProtectedRoute. Pages are lazy-loaded.
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin/klienci',
    lazy: async () => ({
      Component: (await import('./CustomersPage')).CustomersPage,
    }),
  },
  {
    path: '/admin/zamowienia',
    lazy: async () => ({
      Component: (await import('./OrdersPage')).OrdersPage,
    }),
  },
  {
    path: '/admin/zamowienia/:id',
    lazy: async () => ({
      Component: (await import('./OrderPage')).OrderPage,
    }),
  },
  {
    path: '/admin/rabaty',
    lazy: async () => ({
      Component: (await import('./DiscountTemplatesPage'))
        .DiscountTemplatesPage,
    }),
  },
  {
    // 'nowy' = a new szablon; one route, so the editor stays mounted when a create lands on /:id.
    path: '/admin/rabaty/:id',
    lazy: async () => ({
      Component: (await import('./DiscountTemplateEditPage'))
        .DiscountTemplateEditPage,
    }),
  },
  {
    path: '/admin/produkty',
    lazy: async () => ({
      Component: (await import('./ProductsPage')).ProductsPage,
    }),
  },
];
