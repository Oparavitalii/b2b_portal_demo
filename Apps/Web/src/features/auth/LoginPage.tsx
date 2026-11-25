import { type LoginInput, loginSchema } from '@catalog/shared/schemas/auth';
import {
  Alert,
  Anchor,
  Button,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { toSessionUser, useAuthStore } from '@/lib/auth-store';
import { parseApiError } from '@/lib/http';

import { login } from './api';
import { AuthCard } from './AuthCard';
import { accountErrorMessage, zodErrors } from './form-utils';
import { GuestOnly } from './GuestOnly';
import { ResendVerification } from './ResendVerification';

function LoginForm() {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    initialValues: { email: '', password: '' },
    validate: (values) => zodErrors(loginSchema, values),
  });

  const mutation = useMutation({
    mutationFn: login,
    meta: { errorHandled: true },
    onSuccess: (data) => {
      const user = toSessionUser(data.user);
      if (!user) return;
      queryClient.clear();
      queryClient.setQueryData(['account', 'me'], data.user);
      // GuestOnly sees the user and redirects (back to state.from or '/').
      setSession(user, data.accessToken);
    },
    onError: (err, payload) => {
      const info = parseApiError(err);
      setUnverifiedEmail(
        info.code === 'email_not_verified' ? payload.email : null,
      );
    },
  });

  const submit = form.onSubmit((values) => {
    mutation.reset();
    setUnverifiedEmail(null);
    mutation.mutate(loginSchema.parse(values));
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap='md'>
        {unverifiedEmail ? (
          <Alert color='yellow' variant='light' title='Potwierdź adres e-mail'>
            <Stack gap='sm'>
              <Text size='sm'>
                Konto {unverifiedEmail} nie jest jeszcze aktywne. Kliknij link z
                wiadomości, którą wysłaliśmy po rejestracji. Nie dotarła?
              </Text>
              <ResendVerification email={unverifiedEmail} />
            </Stack>
          </Alert>
        ) : mutation.isError ? (
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
        <PasswordInput
          label='Hasło'
          autoComplete='current-password'
          required
          {...form.getInputProps('password')}
        />
        <Anchor component={Link} to='/reset-hasla' size='sm'>
          Nie pamiętasz hasła?
        </Anchor>
        <Button type='submit' loading={mutation.isPending} fullWidth>
          Zaloguj się
        </Button>
      </Stack>
    </form>
  );
}

// /logowanie (R-03, R-11). Pending account → 403 email_not_verified → resend link.
export function LoginPage() {
  return (
    <GuestOnly>
      <AuthCard
        title='Zaloguj się'
        lead='Katalog i ceny B2B są dostępne po zalogowaniu.'
        footer={
          <>
            Nie masz konta?{' '}
            <Anchor component={Link} to='/rejestracja'>
              Zarejestruj firmę
            </Anchor>
          </>
        }
      >
        <LoginForm />
      </AuthCard>
    </GuestOnly>
  );
}
