import type { Order } from '@catalog/shared/schemas/order';
import { Button, Group, Text } from '@mantine/core';
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { company } from '@/content/company';
import { formatPLN } from '@/lib/format';

import classes from './Cart.module.css';

// Success screen after POST /api/orders (R-06): the order number and what happens next.
// mailSent=false: the order is saved but the company e-mail failed — never claim it was sent.
export function OrderSent({ order }: { order: Order }) {
  const phone = company.phones[0];
  const contact = phone ? (
    <a href={`tel:${phone.tel}`}>{phone.display}</a>
  ) : (
    <a href={`mailto:${company.email}`}>{company.email}</a>
  );
  const mailFailed = order.mailSent === false;
  return (
    <div className={classes.done} role='status'>
      <Group gap='sm' align='center' mb='sm'>
        <CheckCircle2 size={28} color='var(--cdm-success)' aria-hidden />
        <span className={classes.number}>{order.number}</span>
      </Group>
      {mailFailed ? (
        <Text size='lg' fw={600} c='cdmInk.9'>
          Zamówienie zostało zapisane, ale nie udało się wysłać go e-mailem do
          DEMO PARTS. Skontaktuj się z nami ({contact}) i podaj numer
          zamówienia.
        </Text>
      ) : (
        <Text size='lg' fw={600} c='cdmInk.9'>
          Zamówienie zostało wysłane do DEMO PARTS. Skontaktujemy się w sprawie
          płatności i dostawy.
        </Text>
      )}
      <Text size='sm' c='cdmInk.6' mt='sm'>
        Razem z kaucją: {formatPLN(order.totals.grossWithDeposit)}
        {order.hasPriceOnRequest ? ' (bez pozycji z ceną na zapytanie)' : ''}.
        Szczegóły znajdziesz w historii zamówień.
      </Text>
      <Group mt='lg' gap='sm'>
        <Button
          component={Link}
          to={`/moje-konto/zamowienia/${order.id}`}
          variant='filled'
          color='cdmInk.9'
        >
          Zobacz zamówienie
        </Button>
        <Button component={Link} to='/' variant='default'>
          Wróć do katalogu
        </Button>
      </Group>
    </div>
  );
}
