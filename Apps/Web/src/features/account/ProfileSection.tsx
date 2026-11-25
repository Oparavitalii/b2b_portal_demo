import {
  type Me,
  type UpdateMeInput,
  updateMeSchema,
} from '@catalog/shared/schemas/account';
import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  accountErrorMessage,
  serverFieldErrors,
  zodErrors,
} from '@/features/auth/form-utils';
import { toSessionUser, useAuthStore } from '@/lib/auth-store';

import classes from './Account.module.css';
import { accountKeys, updateMe, useMe } from './api';
import { SectionError, SectionLoading } from './SectionState';

type ProfileValues = Required<UpdateMeInput>;

// Profile fields are all required in the form (PATCH accepts them optional).
const profileSchema = updateMeSchema.required();

function ProfileForm({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const form = useForm<ProfileValues>({
    initialValues: {
      companyName: me.companyName ?? '',
      nip: me.nip ?? '',
      contactName: me.contactName ?? '',
      phone: me.phone ?? '',
    },
    validate: (values) => zodErrors(profileSchema, values),
  });

  const mutation = useMutation({
    mutationFn: updateMe,
    meta: { errorHandled: true },
    onSuccess: (updated) => {
      queryClient.setQueryData(accountKeys.me, updated);
      const store = useAuthStore.getState();
      const sessionUser = toSessionUser(updated);
      if (sessionUser && store.accessToken) {
        store.setSession(sessionUser, store.accessToken);
      }
      form.setValues({
        companyName: updated.companyName ?? '',
        nip: updated.nip ?? '',
        contactName: updated.contactName ?? '',
        phone: updated.phone ?? '',
      });
      form.resetDirty();
      notifications.show({ color: 'green', message: 'Dane konta zapisane.' });
    },
    onError: (err) => {
      const fields = serverFieldErrors(err);
      if (fields) form.setErrors(fields);
    },
  });

  const submit = form.onSubmit((values) => {
    mutation.reset();
    mutation.mutate(profileSchema.parse(values));
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap='md'>
        {mutation.isError ? (
          <Alert color='red' variant='light' role='alert'>
            {accountErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className={classes.fieldGrid}>
          <TextInput
            label='Adres e-mail (login)'
            value={me.email}
            readOnly
            description='Adresu e-mail nie zmienisz samodzielnie. W tej sprawie napisz na office@catalog-demo.example.'
          />
          <TextInput
            label='Rabat'
            value={`${me.discountPercent.toLocaleString('pl-PL')} %`}
            readOnly
            description='Rabat ustala DEMO PARTS.'
          />
          <TextInput
            label='Nazwa firmy'
            autoComplete='organization'
            required
            {...form.getInputProps('companyName')}
          />
          <TextInput
            label='NIP'
            inputMode='numeric'
            required
            {...form.getInputProps('nip')}
          />
          <TextInput
            label='Imię i nazwisko osoby kontaktowej'
            autoComplete='name'
            required
            {...form.getInputProps('contactName')}
          />
          <TextInput
            label='Telefon'
            type='tel'
            autoComplete='tel'
            required
            {...form.getInputProps('phone')}
          />
        </div>
        <Group>
          <Button
            type='submit'
            loading={mutation.isPending}
            disabled={!form.isDirty()}
          >
            Zapisz zmiany
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

// ?tab=dane (R-07) — company data of the signed-in account.
export function ProfileSection() {
  const me = useMe();
  if (me.isPending) return <SectionLoading />;
  if (me.isError) {
    return <SectionError error={me.error} onRetry={() => void me.refetch()} />;
  }
  return (
    <Stack gap='md'>
      <Text c='cdmInk.6'>
        Dane firmy trafiają do każdego zamówienia. Zmiany nie wpływają na
        zamówienia już złożone.
      </Text>
      <ProfileForm me={me.data} />
    </Stack>
  );
}
