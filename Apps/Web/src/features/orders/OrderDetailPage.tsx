import type { Order } from '@catalog/shared/schemas/order';
import { Alert, Title } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';
import { formatDateTime, formatNip, formatPercent } from '@/lib/format';
import { parseApiError } from '@/lib/http';

import { useOrder } from './api';
import { ErrorState, LoadingState } from './LoadState';
import { OrderItemsTable } from './OrderItemsTable';
import classes from './Orders.module.css';
import { ShipmentStatus } from './ShipmentStatus';
import { TotalsBox } from './TotalsBox';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Also used by the admin order page (features/admin/OrderPage.tsx).
export function OrderView({ order }: { order: Order }) {
  const { customer, address } = order;
  const discount = order.productDiscounts
    ? 'rabaty produktowe wg pozycji'
    : `rabat ${formatPercent(order.discountPercent)}`;
  const lead = `Wysłane ${formatDateTime(order.createdAt)} · ${discount} (nie obejmuje kaucji)`;
  return (
    <>
      <PageTitle eyebrow='Zamówienie' title={order.number} lead={lead} />
      <div className={classes.detailGrid}>
        <section className={classes.card} aria-label='Dane firmy'>
          <h2 className={classes.cardTitle}>Dane firmy</h2>
          <strong>{customer.companyName ?? '—'}</strong>
          <br />
          NIP: {customer.nip ? formatNip(customer.nip) : '—'}
          <br />
          {customer.contactName ?? '—'}
          <br />
          {customer.email ?? '—'}
          <br />
          {customer.phone ?? '—'}
        </section>
        <section className={classes.card} aria-label='Adres dostawy'>
          <h2 className={classes.cardTitle}>Adres dostawy</h2>
          <strong>{address.companyName ?? '—'}</strong>
          <br />
          {address.street ?? '—'}
          <br />
          {[address.postalCode, address.city].filter(Boolean).join(' ')}
          <br />
          {address.country ?? ''}
          {address.phone ? (
            <>
              <br />
              tel. {address.phone}
            </>
          ) : null}
        </section>
      </div>

      <section className={classes.shipping} aria-label='Przesyłka'>
        <h2 className={classes.cardTitle}>
          {order.shipments.length > 1 ? 'Przesyłki' : 'Przesyłka'}
        </h2>
        {order.shipments.length === 0 ? (
          <span className={classes.mutedText}>
            Zamówienie nie zostało jeszcze wysłane.
          </span>
        ) : (
          <ul className={classes.shipmentList}>
            {order.shipments.map((shipment, i) => (
              <li
                key={`${shipment.createdAt}-${i}`}
                className={classes.shipmentItem}
              >
                <ShipmentStatus shipment={shipment} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Title order={2} size='h3' mb='sm'>
        Pozycje
      </Title>
      <OrderItemsTable
        items={order.items}
        showDiscount={order.productDiscounts}
      />

      <div className={classes.summaryRow}>
        <section className={classes.card} aria-label='Uwagi do zamówienia'>
          <h2 className={classes.cardTitle}>Uwagi do zamówienia</h2>
          <span style={{ whiteSpace: 'pre-line' }}>
            {order.note ?? 'Brak uwag.'}
          </span>
        </section>
        <TotalsBox
          totals={order.totals}
          discountPercent={order.discountPercent}
          productDiscounts={order.productDiscounts}
          hasPriceOnRequest={order.hasPriceOnRequest}
          finalLabel='Razem z kaucją'
        />
      </div>
    </>
  );
}

function OrderBody({ id }: { id: string }) {
  const valid = UUID_RE.test(id);
  const order = useOrder(valid ? id : '');

  if (!valid || (order.isError && parseApiError(order.error).status === 404)) {
    return (
      <Alert color='gray' variant='light' role='alert'>
        Nie znaleziono takiego zamówienia.
      </Alert>
    );
  }
  if (order.isPending) return <LoadingState />;
  if (order.isError) {
    return (
      <ErrorState error={order.error} onRetry={() => void order.refetch()} />
    );
  }
  return <OrderView order={order.data} />;
}

// /moje-konto/zamowienia/:id — one sent order with frozen prices (R-10).
export function OrderDetailPage() {
  const { id = '' } = useParams();

  return (
    <div>
      <Link to='/moje-konto/zamowienia' className={classes.back}>
        <ArrowLeft size={16} aria-hidden />
        Wszystkie zamówienia
      </Link>
      <OrderBody id={id} />
    </div>
  );
}
