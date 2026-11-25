import type { RouteObject } from 'react-router-dom';

// R-17: the catalogue sits behind login (collected into the customer + admin
// ProtectedRoute by lib/feature-routes.ts). Pages are lazy-loaded.
export const customerRoutes: RouteObject[] = [
  {
    path: '/',
    lazy: async () => ({
      Component: (await import('./CatalogHome')).CatalogHome,
    }),
  },
  {
    path: '/produkt/:sku',
    lazy: async () => ({
      Component: (await import('./ProductPage')).ProductPage,
    }),
  },
];
