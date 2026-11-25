import {
  type Address,
  addressSchema,
  type Me,
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

import classes from './Account.module.css';
import { accountKeys, saveAddress, useAddress, useMe } from './api';
import { SectionError, SectionLoading } from './SectionState';

interface AddressValues {
  companyName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
}

// A saved address wins; with none yet, company name and phone come from the account.
function initialValues(address: Address | null, me: Me): AddressValues {
  return {
    companyName: address?.companyName ?? me.companyName ?? '',
    street: address?.street ?? '',
    postalCode: address?.postalCode ?? '',
    city: address?.city ?? '',
    country: address?.country ?? 'Polska',
    phone: address?.phone ?? me.phone ?? '',
  };
}

function AddressForm({ address, me }: { address: Address | null; me: Me }) {
  const queryClient = useQueryClient();
  const form = useForm<AddressValues>({
    initialValues: initialValues(address, me),
    validate: (values) => zodErrors(addressSchema, values),
  });

  const mutation = useMutation({
    mutationFn: saveAddress,
    meta: { errorHandled: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(accountKeys.address, saved);
      form.setValues(initialValues(saved, me));
      form.resetDirty();
      notifications.show({
        color: 'green',
        message: 'Adres dostawy zapisany.',
      });
    },
    onError: (err) => {
      const fields = serverFieldErrors(err);
      if (fields) form.setErrors(fields);
    },
  });

  const submit = form.onSubmit((values) => {
    mutation.reset();
    mutation.mutate(addressSchema.parse(values));
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap='md'>
        {address === null ? (
          <Alert color='yellow' variant='light'>
            Nie masz jeszcze zapisanego adresu dostawy. Bez niego nie wyślesz
            zamówienia.
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert color='red' variant='light' role='alert'>
            {accountErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className={classes.fieldGrid}>
          <TextInput
            label='Nazwa firmy / odbiorca'
            autoComplete='organization'
            required
            {...form.getInputProps('companyName')}
          />
          <TextInput
            label='Ulica i numer'
            autoComplete='street-address'
            required
            {...form.getInputProps('street')}
          />
          <TextInput
            label='Kod pocztowy'
            placeholder='00-000'
            autoComplete='postal-code'
            inputMode='numeric'
            required
            {...form.getInputProps('postalCode')}
          />
          <TextInput
            label='Miejscowość'
            autoComplete='address-level2'
            required
            {...form.getInputProps('city')}
          />
          <TextInput
            label='Kraj'
            autoComplete='country-name'
            required
            {...form.getInputProps('country')}
          />
          <TextInput
            label='Telefon dla kuriera'
            type='tel'
            autoComplete='tel'
            description='Opcjonalnie'
            {...form.getInputProps('phone')}
          />
        </div>
        <Group>
          <Button
            type='submit'
            loading={mutation.isPending}
            disabled={address !== null && !form.isDirty()}
          >
            Zapisz adres
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

// ?tab=adres (R-04, R-09) — the one delivery address used by every order.
export function AddressSection() {
  const me = useMe();
  const address = useAddress();

  if (me.isPending || address.isPending) return <SectionLoading />;
  if (me.isError || address.isError) {
    return (
      <SectionError
        error={me.error ?? address.error}
        onRetry={() => {
          void me.refetch();
          void address.refetch();
        }}
      />
    );
  }
  return (
    <Stack gap='md'>
      <Text c='cdmInk.6'>
        Na ten adres wysyłamy zamówione części. Zmiana nie dotyczy zamówień już
        wysłanych.
      </Text>
      <AddressForm address={address.data} me={me.data} />
    </Stack>
  );
}
