import type { Order } from '@catalog/shared/schemas/order';
import { Alert, Button, Group, Text } from '@mantine/core';
import { ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';
import { ErrorState, LoadingState } from '@/features/orders/LoadState';
import { TotalsBox } from '@/features/orders/TotalsBox';
import { useAuthStore } from '@/lib/auth-store';

import { useCart, useClearCart } from './api';
import classes from './Cart.module.css';
import { CartLineRow } from './CartLineRow';
import { CheckoutPanel } from './CheckoutPanel';
import { OrderSent } from './OrderSent';

function EmptyCart() {
  return (
    <div className={classes.panel}>
      <Group gap='sm' mb='xs'>
        <ShoppingCart size={22} aria-hidden />
        <Text fw={600}>Koszyk jest pusty.</Text>
      </Group>
      <Text size='sm' c='cdmInk.6'>
        Wybierz produkty w katalogu i dodaj je do koszyka.{' '}
        <Link to='/' className={classes.link}>
          Przejdź do katalogu
        </Link>
      </Text>
    </div>
  );
}

// /koszyk (R-05): lines, totals netto / brutto / kaucja, delivery address,
// notes and "Wyślij zamówienie" (R-06). Admins can fill a cart but only
// customer accounts send orders.
export function CartPage() {
  const cart = useCart();
  const clearCart = useClearCart();
  const isCustomer = useAuthStore((s) => s.user?.role === 'customer');
  const [sent, setSent] = useState<Order | null>(null);

  let body;
  if (sent) {
    body = <OrderSent order={sent} />;
  } else if (cart.isPending) {
    body = <LoadingState />;
  } else if (cart.isError) {
    body = (
      <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />
    );
  } else if (cart.data.lines.length === 0) {
    body = <EmptyCart />;
  } else {
    const data = cart.data;
    body = (
      <div className={classes.layout}>
        <div>
          <ul className={classes.lines} aria-label='Pozycje w koszyku'>
            {data.lines.map((line) => (
              <CartLineRow
                key={line.id}
                line={line}
                showDiscount={data.productDiscounts}
              />
            ))}
          </ul>
          <Group justify='flex-end' mt='sm'>
            <Button
              variant='subtle'
              color='cdmInk.9'
              size='xs'
              onClick={() => clearCart.mutate()}
              loading={clearCart.isPending}
            >
              Opróżnij koszyk
            </Button>
          </Group>
        </div>
        <aside className={classes.aside} aria-label='Podsumowanie'>
          <TotalsBox
            totals={data.totals}
            discountPercent={data.discountPercent}
            productDiscounts={data.productDiscounts}
            hasPriceOnRequest={data.hasPriceOnRequest}
          />
          {data.hasPriceOnRequest ? (
            <Alert color='gray' variant='light'>
              W koszyku są produkty z ceną na zapytanie. Możesz je zamówić, a
              DEMO PARTS potwierdzi cenę przed realizacją.
            </Alert>
          ) : null}
          {isCustomer ? (
            <CheckoutPanel onSent={setSent} />
          ) : (
            <Alert color='gray' variant='light'>
              Konto administratora nie wysyła zamówień. Mogą to zrobić tylko
              konta klientów.
            </Alert>
          )}
        </aside>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title={sent ? 'Zamówienie wysłane' : 'Koszyk'} />
      {body}
    </div>
  );
}
