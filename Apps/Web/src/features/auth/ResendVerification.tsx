import { resendVerificationSchema } from '@catalog/shared/schemas/auth';
import { Button, Group, Text, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { resendVerification } from './api';
import { accountErrorMessage } from './form-utils';

interface ResendVerificationProps {
  /** Known address (login / registration). Without it the user types one in. */
  email?: string;
}

// "Wyślij link ponownie" — POST /api/auth/resend-verification (R-18). The API
// answers 204 whatever the address, so the confirmation text stays neutral.
export function ResendVerification({ email }: ResendVerificationProps) {
  const [typed, setTyped] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: resendVerification,
    meta: { errorHandled: true },
  });

  function send() {
    const parsed = resendVerificationSchema.safeParse({
      email: email ?? typed,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Podaj adres e-mail');
      return;
    }
    setFieldError(null);
    mutation.mutate(parsed.data.email);
  }

  if (mutation.isSuccess) {
    return (
      <Text size='sm' c='cdmInk.7' role='status'>
        Jeśli konto czeka na potwierdzenie, wysłaliśmy nowy link. Sprawdź
        skrzynkę (także folder spam). Link jest ważny 24 godziny.
      </Text>
    );
  }

  return (
    <Group align='flex-end' gap='sm' wrap='wrap'>
      {email === undefined ? (
        <TextInput
          label='Adres e-mail konta'
          type='email'
          autoComplete='email'
          value={typed}
          onChange={(event) => setTyped(event.currentTarget.value)}
          error={fieldError}
          style={{ flex: '1 1 14rem', minWidth: 0 }}
        />
      ) : null}
      <Button
        variant='default'
        onClick={send}
        loading={mutation.isPending}
        type='button'
      >
        Wyślij link ponownie
      </Button>
      {mutation.isError ? (
        <Text size='sm' c='cdmRed.7' role='alert' w='100%'>
          {accountErrorMessage(mutation.error)}
        </Text>
      ) : null}
      {email !== undefined && fieldError ? (
        <Text size='sm' c='cdmRed.7' role='alert' w='100%'>
          {fieldError}
        </Text>
      ) : null}
    </Group>
  );
}
