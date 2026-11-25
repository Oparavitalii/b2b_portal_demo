import { Alert, Button, Center, Loader, Stack } from '@mantine/core';

import { apiErrorMessage } from '@/lib/http';

// Loading / load-error states of the order and cart pages.
export function LoadingState() {
  return (
    <Center py='xl' aria-busy='true' aria-label='Ładowanie'>
      <Loader color='cdmInk.9' />
    </Center>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Stack gap='sm' align='flex-start'>
      <Alert color='red' variant='light' role='alert'>
        Nie udało się wczytać danych. {apiErrorMessage(error)}
      </Alert>
      <Button variant='default' onClick={onRetry}>
        Spróbuj ponownie
      </Button>
    </Stack>
  );
}
