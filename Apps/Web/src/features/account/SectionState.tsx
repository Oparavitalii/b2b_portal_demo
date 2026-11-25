import { Alert, Button, Center, Loader, Stack } from '@mantine/core';

import { accountErrorMessage } from '@/features/auth/form-utils';

// Loading / load-error states shared by the account sections.
export function SectionLoading() {
  return (
    <Center py='lg' aria-busy='true' aria-label='Ładowanie'>
      <Loader color='cdmInk.9' />
    </Center>
  );
}

export function SectionError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Stack gap='sm' align='flex-start'>
      <Alert color='red' variant='light' role='alert'>
        Nie udało się wczytać danych. {accountErrorMessage(error)}
      </Alert>
      <Button variant='default' onClick={onRetry}>
        Spróbuj ponownie
      </Button>
    </Stack>
  );
}
