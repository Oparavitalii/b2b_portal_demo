import type { RouteObject } from 'react-router-dom';

// "Moje konto" (customer + admin). Sections are chosen by ?tab=; the order
// history at /moje-konto/zamowienia belongs to the orders feature.
export const customerRoutes: RouteObject[] = [
  {
    path: '/moje-konto',
    lazy: async () => ({
      Component: (await import('./AccountPage')).AccountPage,
    }),
  },
];
