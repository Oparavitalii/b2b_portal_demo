import { ORDER_NOTE_MAX, type Order } from '@catalog/shared/schemas/order';
import { Alert, Button, Loader, Text, Textarea } from '@mantine/core';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { company } from '@/content/company';
import { useAddress, useMe } from '@/features/account/api';
import { useCreateOrder } from '@/features/orders/api';
import { apiErrorMessage, parseApiError } from '@/lib/http';

import classes from './Cart.module.css';

const ADDRESS_TAB = '/moje-konto?tab=adres';
const PROFILE_TAB = '/moje-konto?tab=dane';
const ORDERS_PHONE = company.phones[0]?.display ?? company.email;

function orderErrorMessage(err: unknown): string {
  const { code } = parseApiError(err);
  if (code === 'company_data_required')
    return 'Uzupełnij dane firmy w zakładce „Moje konto”, aby wysłać zamówienie.';
  if (code === 'address_required')
    return 'Dodaj adres dostawy w zakładce „Moje konto”, aby wysłać zamówienie.';
  if (code === 'cart_empty')
    return 'Koszyk jest pusty. Dodaj produkty, zanim wyślesz zamówienie.';
  if (code === 'order_email_not_configured')
    return `Wysyłanie zamówień jest chwilowo niedostępne. Zadzwoń do DEMO PARTS: ${ORDERS_PHONE}.`;
  return `Nie wysłano zamówienia. ${apiErrorMessage(err)}`;
}

function AddressPreview() {
  const address = useAddress();
  if (address.isPending) return <Loader size='sm' color='cdmInk.9' />;
  if (address.isError) {
    return (
      <Text size='sm' c='cdmInk.6'>
        Nie udało się wczytać adresu.{' '}
        <Link to={ADDRESS_TAB} className={classes.link}>
          Sprawdź adres dostawy
        </Link>
      </Text>
    );
  }
  const a = address.data;
  if (a === null) {
    return (
      <Alert color='gray' variant='light'>
        Brak adresu dostawy.{' '}
        <Link to={ADDRESS_TAB} className={classes.link}>
          Dodaj adres
        </Link>
        . Bez niego nie wyślesz zamówienia.
      </Alert>
    );
  }
  return (
    <>
      <strong>{a.companyName}</strong>
      <br />
      {a.street}
      <br />
      {a.postalCode} {a.city}
      <br />
      {a.country}
      {a.phone ? (
        <>
          <br />
          tel. {a.phone}
        </>
      ) : null}
      <br />
      <Link to={ADDRESS_TAB} className={classes.link}>
        Zmień adres
      </Link>
    </>
  );
}

// Registration asks only for e-mail + password; an order needs the company
// name, NIP, contact person and phone (API: 422 company_data_required).
function CompanyDataMissing() {
  return (
    <Alert color='gray' variant='light' mb='md'>
      Brak danych firmy (nazwa, NIP, osoba kontaktowa, telefon).{' '}
      <Link to={PROFILE_TAB} className={classes.link}>
        Uzupełnij dane konta
      </Link>
      . Bez nich nie wyślesz zamówienia.
    </Alert>
  );
}

// Delivery address preview, "Uwagi do zamówienia" and "Wyślij zamówienie".
// No payment and no delivery choice (N-01, N-02): DEMO PARTS contacts the customer.
export function CheckoutPanel({ onSent }: { onSent: (order: Order) => void }) {
  const [note, setNote] = useState('');
  const createOrder = useCreateOrder();
  const address = useAddress();
  const me = useMe();
  const companyMissing =
    me.data !== undefined &&
    [me.data.companyName, me.data.nip, me.data.contactName, me.data.phone].some(
      (v) => !v,
    );
  const tooLong = note.trim().length > ORDER_NOTE_MAX;

  const send = () => {
    createOrder.mutate(
      { note: note.trim() === '' ? null : note.trim() },
      { onSuccess: onSent },
    );
  };

  return (
    <>
      {companyMissing ? <CompanyDataMissing /> : null}
      <section className={classes.panel} aria-label='Adres dostawy'>
        <h2 className={classes.panelTitle}>Adres dostawy</h2>
        <AddressPreview />
      </section>

      <section className={classes.panel} aria-label='Wysyłka zamówienia'>
        <Textarea
          label='Uwagi do zamówienia'
          placeholder='Np. preferowany termin kontaktu, wewnętrzny numer zamówienia'
          autosize
          minRows={3}
          maxRows={8}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          error={
            tooLong
              ? `Uwagi mogą mieć najwyżej ${ORDER_NOTE_MAX} znaków`
              : undefined
          }
        />
        <Text size='xs' c='cdmInk.6' mt={4}>
          {note.trim().length} / {ORDER_NOTE_MAX}
        </Text>

        {createOrder.isError ? (
          <Alert color='red' variant='light' role='alert' mt='sm'>
            {orderErrorMessage(createOrder.error)}
          </Alert>
        ) : null}

        <Button
          fullWidth
          mt='md'
          size='md'
          leftSection={<Send size={18} aria-hidden />}
          onClick={send}
          loading={createOrder.isPending}
          disabled={tooLong || address.data === null || companyMissing}
        >
          Wyślij zamówienie
        </Button>
        <Text size='xs' c='cdmInk.6' mt='xs'>
          Zamówienie trafi do DEMO PARTS. Płatność i dostawę ustalimy z tobą
          bezpośrednio.
        </Text>
      </section>
    </>
  );
}
