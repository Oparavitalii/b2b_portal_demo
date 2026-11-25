import type { RouteObject } from 'react-router-dom';

// Order history inside "Moje konto" (R-10). Sending an order happens on
// /koszyk (cart feature).
export const customerRoutes: RouteObject[] = [
  {
    path: '/moje-konto/zamowienia',
    lazy: async () => ({
      Component: (await import('./OrdersPage')).OrdersPage,
    }),
  },
  {
    path: '/moje-konto/zamowienia/:id',
    lazy: async () => ({
      Component: (await import('./OrderDetailPage')).OrderDetailPage,
    }),
  },
];
