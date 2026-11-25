import { verifyEmailSchema } from '@catalog/shared/schemas/auth';
import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { verifyEmail } from './api';
import { AuthCard } from './AuthCard';
import { accountErrorMessage } from './form-utils';
import { ResendVerification } from './ResendVerification';

// The token is single-use, so the call runs as a query: StrictMode's double
// mount and re-renders share one request, and it is never retried or refetched.
function useVerification(token: string | null) {
  return useQuery({
    queryKey: ['auth', 'verify-email', token],
    queryFn: () => verifyEmail(token ?? ''),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

// /potwierdz-email?token=... (R-18) — the link from the verify_email mail.
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const parsed = verifyEmailSchema.safeParse({ token: params.get('token') });
  const token = parsed.success ? parsed.data.token : null;
  const query = useVerification(token);

  if (token === null || query.isError) {
    return (
      <AuthCard title='Link jest nieprawidłowy'>
        <Stack gap='md'>
          <Alert color='red' variant='light' role='alert'>
            {token === null
              ? 'W linku brakuje kodu potwierdzającego. Otwórz pełny link z wiadomości e-mail.'
              : accountErrorMessage(query.error)}
          </Alert>
          <Text size='sm' c='cdmInk.6'>
            Jeśli konto jest już potwierdzone, zaloguj się. Jeśli link wygasł,
            wyślemy nowy.
          </Text>
          <ResendVerification />
          <Button component={Link} to='/logowanie' variant='default'>
            Przejdź do logowania
          </Button>
        </Stack>
      </AuthCard>
    );
  }

  if (query.isPending) {
    return (
      <AuthCard title='Potwierdzamy adres e-mail'>
        <Center py='lg' aria-busy='true' aria-label='Potwierdzanie'>
          <Loader color='cdmInk.9' />
        </Center>
      </AuthCard>
    );
  }

  return (
    <AuthCard title='Adres e-mail potwierdzony'>
      <Stack gap='md' role='status'>
        <Text>
          Konto <strong>{query.data.email}</strong> jest aktywne. Możesz się
          teraz zalogować i przeglądać katalog.
        </Text>
        <Button component={Link} to='/logowanie'>
          Zaloguj się
        </Button>
      </Stack>
    </AuthCard>
  );
}
