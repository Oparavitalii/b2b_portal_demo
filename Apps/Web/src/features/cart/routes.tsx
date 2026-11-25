import type { RouteObject } from 'react-router-dom';

// Koszyk (R-05) — customers and admins; sending the order (R-06) happens here too.
export const customerRoutes: RouteObject[] = [
  {
    path: '/koszyk',
    lazy: async () => ({
      Component: (await import('./CartPage')).CartPage,
    }),
  },
];
