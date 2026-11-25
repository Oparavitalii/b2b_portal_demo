import { newPasswordSchema } from '@catalog/shared/schemas/auth';
import { Alert, Anchor, Button, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { parseApiError } from '@/lib/http';

import { confirmPasswordReset } from './api';
import { AuthCard } from './AuthCard';
import { accountErrorMessage, zodErrors } from './form-utils';

// New password typed twice; only `password` goes to the API.
const formSchema = z
  .object({ password: newPasswordSchema, repeat: z.string() })
  .refine((v) => v.password === v.repeat, {
    path: ['repeat'],
    message: 'Hasła nie są takie same',
  });

type FormValues = z.input<typeof formSchema>;

// /reset-hasla/potwierdz?token=... (R-24) — the link from reset_password mail.
export function ResetConfirmPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const form = useForm<FormValues>({
    initialValues: { password: '', repeat: '' },
    validate: (values) => zodErrors(formSchema, values),
  });
  const mutation = useMutation({
    mutationFn: confirmPasswordReset,
    meta: { errorHandled: true },
  });

  const badLink =
    token.length < 20 ||
    (mutation.isError &&
      parseApiError(mutation.error).code === 'invalid_token');

  if (badLink) {
    return (
      <AuthCard title='Link jest nieprawidłowy'>
        <Stack gap='md'>
          <Alert color='red' variant='light' role='alert'>
            Link do ustawienia hasła wygasł, został już użyty albo jest
            niepełny. Linki są ważne 60 minut.
          </Alert>
          <Button component={Link} to='/reset-hasla'>
            Wyślij nowy link
          </Button>
        </Stack>
      </AuthCard>
    );
  }

  if (mutation.isSuccess) {
    return (
      <AuthCard title='Hasło zostało zmienione'>
        <Stack gap='md' role='status'>
          <Alert color='green' variant='light'>
            Nowe hasło jest aktywne. Dla bezpieczeństwa zakończyliśmy wszystkie
            wcześniejsze sesje.
          </Alert>
          <Button component={Link} to='/logowanie'>
            Zaloguj się
          </Button>
        </Stack>
      </AuthCard>
    );
  }

  const submit = form.onSubmit((values) => {
    mutation.reset();
    mutation.mutate({ token, password: values.password });
  });

  return (
    <AuthCard
      title='Ustaw nowe hasło'
      footer={
        <Anchor component={Link} to='/logowanie'>
          Wróć do logowania
        </Anchor>
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack gap='md'>
          {mutation.isError ? (
            <Alert color='red' variant='light' role='alert'>
              {accountErrorMessage(mutation.error)}
            </Alert>
          ) : null}
          <PasswordInput
            label='Nowe hasło'
            description='Co najmniej 8 znaków'
            autoComplete='new-password'
            required
            {...form.getInputProps('password')}
          />
          <PasswordInput
            label='Powtórz nowe hasło'
            autoComplete='new-password'
            required
            {...form.getInputProps('repeat')}
          />
          <Button type='submit' loading={mutation.isPending} fullWidth>
            Zapisz nowe hasło
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
