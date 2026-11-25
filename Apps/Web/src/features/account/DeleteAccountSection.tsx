import { deleteAccountSchema } from '@catalog/shared/schemas/account';
import { Alert, Button, List, PasswordInput, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  accountErrorMessage,
  serverFieldErrors,
  zodErrors,
} from '@/features/auth/form-utils';
import { useAuthStore } from '@/lib/auth-store';
import { parseApiError } from '@/lib/http';

import classes from './Account.module.css';
import { deleteAccount } from './api';

function DeleteForm() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({
    initialValues: { password: '' },
    validate: (values) => zodErrors(deleteAccountSchema, values),
  });

  const mutation = useMutation({
    mutationFn: deleteAccount,
    meta: { errorHandled: true },
    onSuccess: () => {
      // The API already removed every session; drop the local one too.
      clear();
      queryClient.clear();
      notifications.show({
        color: 'green',
        message: 'Konto zostało usunięte.',
        autoClose: 8000,
      });
      navigate('/logowanie', { replace: true });
    },
    onError: (err) => {
      if (parseApiError(err).code === 'wrong_password') {
        form.setFieldError('password', 'Hasło jest nieprawidłowe.');
        return;
      }
      const fields = serverFieldErrors(err);
      if (fields) form.setErrors(fields);
    },
  });

  const submit = form.onSubmit((values) => {
    mutation.reset();
    mutation.mutate(deleteAccountSchema.parse(values));
  });

  const showAlert =
    mutation.isError && parseApiError(mutation.error).code !== 'wrong_password';

  return (
    <form onSubmit={submit} noValidate className={classes.formNarrow}>
      <Stack gap='md'>
        {showAlert ? (
          <Alert color='red' variant='light' role='alert'>
            {accountErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <PasswordInput
          label='Podaj hasło, aby potwierdzić'
          autoComplete='current-password'
          required
          {...form.getInputProps('password')}
        />
        <Button type='submit' color='cdmRed' loading={mutation.isPending}>
          Usuń konto
        </Button>
      </Stack>
    </form>
  );
}

// ?tab=usun-konto (R-12). Customers only — the API answers 403 for an admin.
export function DeleteAccountSection() {
  const role = useAuthStore((s) => s.user?.role);

  if (role === 'admin') {
    return (
      <Alert color='gray' variant='light'>
        Konta administratora nie można usunąć w zakładce „Moje konto”.
      </Alert>
    );
  }

  return (
    <Stack gap='md'>
      <Text>Usunięcie konta jest nieodwracalne. Razem z kontem usuwamy:</Text>
      <List size='sm' spacing={4}>
        <List.Item>dane firmy i dane logowania,</List.Item>
        <List.Item>zapisany adres dostawy,</List.Item>
        <List.Item>zawartość koszyka,</List.Item>
        <List.Item>wszystkie aktywne sesje.</List.Item>
      </List>
      <Text size='sm' c='cdmInk.6'>
        Złożone zamówienia zostają w naszej ewidencji (ze względu na obowiązki
        księgowe i obsługę reklamacji), ale nie są już powiązane z kontem.
      </Text>
      <DeleteForm />
    </Stack>
  );
}
