import {
  type ResetRequestInput,
  resetRequestSchema,
} from '@catalog/shared/schemas/auth';
import { Alert, Anchor, Button, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { requestPasswordReset } from './api';
import { AuthCard } from './AuthCard';
import { accountErrorMessage, zodErrors } from './form-utils';

// /reset-hasla (R-24). The API answers 204 for any address, so the success
// text never reveals whether an account exists.
export function ResetRequestPage() {
  const form = useForm<ResetRequestInput>({
    initialValues: { email: '' },
    validate: (values) => zodErrors(resetRequestSchema, values),
  });
  const mutation = useMutation({
    mutationFn: requestPasswordReset,
    meta: { errorHandled: true },
  });

  const submit = form.onSubmit((values) => {
    mutation.reset();
    mutation.mutate(resetRequestSchema.parse(values));
  });

  return (
    <AuthCard
      title='Nie pamiętasz hasła?'
      lead='Podaj adres e-mail konta, a wyślemy link do ustawienia nowego hasła.'
      footer={
        <Anchor component={Link} to='/logowanie'>
          Wróć do logowania
        </Anchor>
      }
    >
      {mutation.isSuccess ? (
        <Alert
          color='green'
          variant='light'
          role='status'
          title='Sprawdź skrzynkę e-mail'
        >
          Jeśli konto z adresem {form.getValues().email} istnieje i jest
          aktywne, wysłaliśmy na ten adres link do ustawienia nowego hasła. Link
          jest ważny 60 minut.
        </Alert>
      ) : (
        <form onSubmit={submit} noValidate>
          <Stack gap='md'>
            {mutation.isError ? (
              <Alert color='red' variant='light' role='alert'>
                {accountErrorMessage(mutation.error)}
              </Alert>
            ) : null}
            <TextInput
              label='Adres e-mail'
              type='email'
              autoComplete='email'
              required
              {...form.getInputProps('email')}
            />
            <Button type='submit' loading={mutation.isPending} fullWidth>
              Wyślij link
            </Button>
          </Stack>
        </form>
      )}
    </AuthCard>
  );
}
