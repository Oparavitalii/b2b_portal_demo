import {
  type RegisterInput,
  registerSchema,
} from '@catalog/shared/schemas/auth';
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { parseApiError } from '@/lib/http';

import { register } from './api';
import { AuthCard } from './AuthCard';
import {
  accountErrorMessage,
  serverFieldErrors,
  zodErrors,
} from './form-utils';
import { GuestOnly } from './GuestOnly';
import { ResendVerification } from './ResendVerification';

// Form state: acceptTerms is a plain boolean until zod checks it is `true`.
type RegisterValues = Omit<RegisterInput, 'acceptTerms'> & {
  acceptTerms: boolean;
};

const EMPTY: RegisterValues = {
  email: '',
  password: '',
  acceptTerms: false,
};

function CheckInbox({ email }: { email: string }) {
  return (
    <Stack gap='md' role='status'>
      <Alert
        color='green'
        variant='light'
        icon={<MailCheck size={20} aria-hidden />}
        title='Sprawdź skrzynkę e-mail'
      >
        Wysłaliśmy link aktywacyjny na adres <strong>{email}</strong>. Kliknij
        go, aby potwierdzić adres e-mail. Potem możesz się zalogować. Link jest
        ważny 24 godziny.
      </Alert>
      <Text size='sm' c='cdmInk.6'>
        Wiadomość nie dotarła? Sprawdź folder spam albo wyślij link jeszcze raz.
      </Text>
      <ResendVerification email={email} />
      <Anchor component={Link} to='/logowanie' size='sm'>
        Przejdź do logowania
      </Anchor>
    </Stack>
  );
}

function RegisterForm() {
  const form = useForm<RegisterValues>({
    initialValues: EMPTY,
    validate: (values) => zodErrors(registerSchema, values),
  });

  const mutation = useMutation({
    mutationFn: register,
    meta: { errorHandled: true },
    onError: (err) => {
      const info = parseApiError(err);
      if (info.code === 'email_taken') {
        form.setFieldError('email', 'Konto z tym adresem e-mail już istnieje.');
        return;
      }
      const fields = serverFieldErrors(err);
      if (fields) form.setErrors(fields);
    },
  });

  if (mutation.isSuccess) return <CheckInbox email={mutation.data.email} />;

  const submit = form.onSubmit((values) => {
    mutation.reset();
    mutation.mutate(registerSchema.parse(values));
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap='md'>
        {mutation.isError ? (
          <Alert color='red' variant='light' role='alert'>
            {accountErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <TextInput
          label='Adres e-mail (login)'
          type='email'
          autoComplete='email'
          required
          {...form.getInputProps('email')}
        />
        <PasswordInput
          label='Hasło'
          description='Co najmniej 8 znaków'
          autoComplete='new-password'
          required
          {...form.getInputProps('password')}
        />
        <Checkbox
          {...form.getInputProps('acceptTerms', { type: 'checkbox' })}
          label={
            <>
              Akceptuję{' '}
              <Anchor component={Link} to='/regulamin' target='_blank'>
                Regulamin
              </Anchor>{' '}
              i{' '}
              <Anchor
                component={Link}
                to='/polityka-prywatnosci'
                target='_blank'
              >
                Politykę prywatności
              </Anchor>
            </>
          }
        />
        <Button type='submit' loading={mutation.isPending}>
          Załóż konto
        </Button>
      </Stack>
    </form>
  );
}

// /rejestracja (R-03): e-mail + password only; company data comes later in
// "Moje konto". The account stays inactive until the e-mail link is clicked (R-18).
export function RegisterPage() {
  return (
    <GuestOnly>
      <AuthCard
        title='Rejestracja firmy'
        lead='Konto B2B daje dostęp do katalogu, cen i składania zamówień. Po rejestracji potwierdź adres e-mail, a dane firmy uzupełnij w zakładce „Moje konto”.'
        footer={
          <>
            Masz już konto?{' '}
            <Anchor component={Link} to='/logowanie'>
              Zaloguj się
            </Anchor>
          </>
        }
      >
        <RegisterForm />
      </AuthCard>
    </GuestOnly>
  );
}
