import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications, notifications } from '@mantine/notifications';
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { RouterProvider } from 'react-router-dom';

import { apiErrorMessage, parseApiError } from '@/lib/http';

import { AuthHydrator } from './AuthHydrator';
import { router } from './routes';
import { theme } from './theme';

const queryClient = new QueryClient({
  // No mutation may fail silently: without its own onError (or
  // meta.errorHandled) a failed save shows a Polish toast.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError || mutation.meta?.['errorHandled']) return;
      notifications.show({
        color: 'red',
        message: apiErrorMessage(error),
        autoClose: 8000,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // 4xx is deterministic (401 refresh is handled inside apiFetch) — no retry.
      retry: (failureCount, error) => {
        const status = parseApiError(error).status;
        if (
          status &&
          status >= 400 &&
          status < 500 &&
          status !== 408 &&
          status !== 429
        ) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
});

// Rendered outside MantineProvider (the boundary wraps it), so plain HTML.
function ErrorFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <main
      role='alert'
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
        fontFamily: 'var(--cdm-font-body)',
        color: 'var(--cdm-ink)',
      }}
    >
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1
          style={{ fontFamily: 'var(--cdm-font-head)', margin: '0 0 0.5rem' }}
        >
          Coś poszło nie tak
        </h1>
        <p style={{ margin: '0 0 1rem', color: 'var(--cdm-ink-muted)' }}>
          Wystąpił nieoczekiwany błąd. Spróbuj ponownie, a jeśli problem się
          powtarza, napisz na office@catalog-demo.example.
        </p>
        <button
          type='button'
          onClick={() => resetErrorBoundary()}
          style={{
            padding: '0.625rem 1.25rem',
            border: 0,
            borderRadius: 'var(--cdm-radius-sm)',
            background: 'var(--cdm-ink)',
            color: 'var(--cdm-fg)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Spróbuj ponownie
        </button>
      </div>
    </main>
  );
}

export function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <MantineProvider theme={theme} defaultColorScheme='light'>
        <Notifications position='top-right' />
        <ModalsProvider>
          <QueryClientProvider client={queryClient}>
            <AuthHydrator>
              <RouterProvider router={router} />
            </AuthHydrator>
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>
    </ErrorBoundary>
  );
}
