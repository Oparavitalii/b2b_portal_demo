import { changePasswordSchema } from '@catalog/shared/schemas/account';
import { Alert, Button, PasswordInput, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import {
  accountErrorMessage,
  serverFieldErrors,
  zodErrors,
} from '@/features/auth/form-utils';
import { parseApiError } from '@/lib/http';

import classes from './Account.module.css';
import { changePassword } from './api';

// The new password typed twice; only currentPassword + newPassword go to the API.
const formSchema = changePasswordSchema
  .extend({ repeat: z.string() })
  .refine((v) => v.newPassword === v.repeat, {
    path: ['repeat'],
    message: 'Hasła nie są takie same',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Nowe hasło musi różnić się od obecnego',
  });

type FormValues = z.input<typeof formSchema>;

const EMPTY: FormValues = { currentPassword: '', newPassword: '', repeat: '' };

// ?tab=haslo (R-08). The API keeps this session and signs out every other one.
export function PasswordSection() {
  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: (values) => zodErrors(formSchema, values),
  });

  const mutation = useMutation({
    mutationFn: changePassword,
    meta: { errorHandled: true },
    onSuccess: () => {
      form.setValues(EMPTY);
      form.resetDirty();
      notifications.show({
        color: 'green',
        message:
          'Hasło zostało zmienione. Sesje na pozostałych urządzeniach zostały zakończone.',
      });
    },
    onError: (err) => {
      if (parseApiError(err).code === 'wrong_password') {
        form.setFieldError(
          'currentPassword',
          'Obecne hasło jest nieprawidłowe.',
        );
        return;
      }
      const fields = serverFieldErrors(err);
      if (fields) form.setErrors(fields);
    },
  });

  const submit = form.onSubmit((values) => {
    mutation.reset();
    mutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  });

  const showAlert =
    mutation.isError && parseApiError(mutation.error).code !== 'wrong_password';

  return (
    <Stack gap='md'>
      <Text c='cdmInk.6'>
        Po zmianie hasła sesja na tym urządzeniu pozostanie aktywna, a sesje na
        pozostałych urządzeniach zakończymy.
      </Text>
      <form onSubmit={submit} noValidate className={classes.formNarrow}>
        <Stack gap='md'>
          {showAlert ? (
            <Alert color='red' variant='light' role='alert'>
              {accountErrorMessage(mutation.error)}
            </Alert>
          ) : null}
          <PasswordInput
            label='Obecne hasło'
            autoComplete='current-password'
            required
            {...form.getInputProps('currentPassword')}
          />
          <PasswordInput
            label='Nowe hasło'
            description='Co najmniej 8 znaków'
            autoComplete='new-password'
            required
            {...form.getInputProps('newPassword')}
          />
          <PasswordInput
            label='Powtórz nowe hasło'
            autoComplete='new-password'
            required
            {...form.getInputProps('repeat')}
          />
          <Button type='submit' loading={mutation.isPending}>
            Zmień hasło
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
