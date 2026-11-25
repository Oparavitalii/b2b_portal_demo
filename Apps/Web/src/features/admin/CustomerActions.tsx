import type { CustomerAdmin } from '@catalog/shared/schemas/admin';
import { Button, Drawer, Group, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Ban, Code2, LockOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ApiKeysPanel } from '@/features/apiKeys/ApiKeysPanel';

import { apiErrorMessage } from '@/lib/http';

import { useDeleteCustomer, useSetCustomerBlocked } from './api';

function fail(title: string, err: unknown) {
  notifications.show({
    color: 'red',
    title,
    message: apiErrorMessage(err),
    autoClose: 8000,
  });
}

// API keys (B-21, drawer), block / unblock and delete one customer account. Both ask for confirmation;
// deleting keeps the customer's orders (snapshots), like self-deletion does.
export function CustomerActions({ customer }: { customer: CustomerAdmin }) {
  const setBlocked = useSetCustomerBlocked();
  const remove = useDeleteCustomer();
  const label = customer.companyName ?? customer.email;
  const blocked = customer.blockedAt !== null;
  const [keysOpen, setKeysOpen] = useState(false);

  const toggleBlock = () =>
    modals.openConfirmModal({
      title: blocked ? 'Odblokować klienta?' : 'Zablokować klienta?',
      children: (
        <Text size='sm'>
          {blocked
            ? `${label} znów będzie mógł się zalogować i składać zamówienia.`
            : `${label} zostanie wylogowany i nie będzie mógł się zalogować, dopóki go nie odblokujesz. Konto i zamówienia zostają.`}
        </Text>
      ),
      labels: {
        confirm: blocked ? 'Odblokuj' : 'Zablokuj',
        cancel: 'Anuluj',
      },
      confirmProps: { color: blocked ? 'cdmInk' : 'orange' },
      onConfirm: () =>
        setBlocked.mutate(
          { id: customer.id, blocked: !blocked },
          {
            onSuccess: () =>
              notifications.show({
                color: 'green',
                message: blocked
                  ? `Odblokowano: ${label}`
                  : `Zablokowano: ${label}`,
              }),
            onError: (err) =>
              fail(
                blocked ? 'Nie odblokowano klienta' : 'Nie zablokowano klienta',
                err,
              ),
          },
        ),
    });

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Usunąć konto klienta?',
      children: (
        <Text size='sm'>
          Konto {label} ({customer.email}) zostanie trwale usunięte razem z
          koszykiem i adresem. Wysłane zamówienia zostają w historii. Tej
          operacji nie można cofnąć.
        </Text>
      ),
      labels: { confirm: 'Usuń konto', cancel: 'Anuluj' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(customer.id, {
          onSuccess: () =>
            notifications.show({
              color: 'green',
              message: `Usunięto konto: ${label}`,
            }),
          onError: (err) => fail('Nie usunięto konta', err),
        }),
    });

  return (
    <Group gap='xs' wrap='nowrap'>
      <Button
        size='xs'
        variant='light'
        color='cdmInk'
        leftSection={<Code2 size={14} aria-hidden />}
        onClick={() => setKeysOpen(true)}
        aria-label={`Klucze API klienta ${label}`}
      >
        API
      </Button>
      <Drawer
        opened={keysOpen}
        onClose={() => setKeysOpen(false)}
        position='right'
        size='xl'
        title={`Klucze API: ${label}`}
      >
        {keysOpen ? <ApiKeysPanel owner={customer.id} /> : null}
      </Drawer>
      <Button
        size='xs'
        variant='light'
        color={blocked ? 'cdmInk' : 'orange'}
        leftSection={
          blocked ? (
            <LockOpen size={14} aria-hidden />
          ) : (
            <Ban size={14} aria-hidden />
          )
        }
        onClick={toggleBlock}
        loading={setBlocked.isPending}
        aria-label={`${blocked ? 'Odblokuj' : 'Zablokuj'} klienta ${label}`}
      >
        {blocked ? 'Odblokuj' : 'Zablokuj'}
      </Button>
      <Button
        size='xs'
        variant='subtle'
        color='red'
        leftSection={<Trash2 size={14} aria-hidden />}
        onClick={confirmDelete}
        loading={remove.isPending}
        aria-label={`Usuń klienta ${label}`}
      >
        Usuń
      </Button>
    </Group>
  );
}
