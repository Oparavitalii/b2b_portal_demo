import type { RouteObject } from 'react-router-dom';

// Public auth pages (R-03, R-18, R-24). Lazy: each page is its own chunk.
export const publicRoutes: RouteObject[] = [
  {
    path: '/logowanie',
    lazy: async () => ({
      Component: (await import('./LoginPage')).LoginPage,
    }),
  },
  {
    path: '/rejestracja',
    lazy: async () => ({
      Component: (await import('./RegisterPage')).RegisterPage,
    }),
  },
  {
    path: '/potwierdz-email',
    lazy: async () => ({
      Component: (await import('./VerifyEmailPage')).VerifyEmailPage,
    }),
  },
  {
    path: '/reset-hasla',
    lazy: async () => ({
      Component: (await import('./ResetRequestPage')).ResetRequestPage,
    }),
  },
  {
    path: '/reset-hasla/potwierdz',
    lazy: async () => ({
      Component: (await import('./ResetConfirmPage')).ResetConfirmPage,
    }),
  },
];
