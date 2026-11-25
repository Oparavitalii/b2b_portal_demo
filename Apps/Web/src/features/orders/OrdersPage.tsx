import { Alert, Table, Text } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';
import { useAuthStore } from '@/lib/auth-store';
import { formatDateTime, formatPLN } from '@/lib/format';

import { useOrders } from './api';
import { ErrorState, LoadingState } from './LoadState';
import classes from './Orders.module.css';
import { ShipmentCell } from './ShipmentStatus';

function OrdersBody({ isCustomer }: { isCustomer: boolean }) {
  const orders = useOrders(isCustomer);

  if (!isCustomer) {
    return (
      <Alert color='gray' variant='light'>
        Konto administratora nie wysyła zamówień, więc nie ma ich historii.
      </Alert>
    );
  }
  if (orders.isPending) return <LoadingState />;
  if (orders.isError) {
    return (
      <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
    );
  }
  if (orders.data.items.length === 0) {
    return (
      <Text c='cdmInk.6'>
        Nie wysłano jeszcze żadnego zamówienia.{' '}
        <Link to='/' className={classes.link}>
          Przejdź do katalogu
        </Link>
      </Text>
    );
  }
  return (
    <Table.ScrollContainer minWidth={820}>
      <Table verticalSpacing='sm' highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Numer</Table.Th>
            <Table.Th>Data</Table.Th>
            <Table.Th className={classes.num}>Pozycje</Table.Th>
            <Table.Th className={classes.num}>Netto</Table.Th>
            <Table.Th className={classes.num}>Brutto</Table.Th>
            <Table.Th className={classes.num}>Kaucja</Table.Th>
            <Table.Th className={classes.num}>Razem z kaucją</Table.Th>
            <Table.Th>Przesyłka</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {orders.data.items.map((order) => (
            <Table.Tr key={order.id}>
              <Table.Td>
                <Link
                  to={`/moje-konto/zamowienia/${order.id}`}
                  className={classes.link}
                >
                  {order.number}
                </Link>
                {order.hasPriceOnRequest ? (
                  <div className={classes.muted}>z ceną na zapytanie</div>
                ) : null}
              </Table.Td>
              <Table.Td>{formatDateTime(order.createdAt)}</Table.Td>
              <Table.Td className={classes.num}>{order.itemsCount}</Table.Td>
              <Table.Td className={classes.num}>
                {formatPLN(order.totals.net)}
              </Table.Td>
              <Table.Td className={classes.num}>
                {formatPLN(order.totals.gross)}
              </Table.Td>
              <Table.Td className={classes.num}>
                {formatPLN(order.totals.deposit)}
              </Table.Td>
              <Table.Td className={classes.num}>
                <strong>{formatPLN(order.totals.grossWithDeposit)}</strong>
              </Table.Td>
              <Table.Td>
                <ShipmentCell shipment={order.shipment} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

// /moje-konto/zamowienia — orders sent by this customer, newest first (R-10).
// Orders have no statuses of their own (N-04); the last column shows the
// latest InPost shipment status (B-22: R-03).
export function OrdersPage() {
  const isCustomer = useAuthStore((s) => s.user?.role === 'customer');

  return (
    <div>
      <Link to='/moje-konto' className={classes.back}>
        <ArrowLeft size={16} aria-hidden />
        Moje konto
      </Link>
      <PageTitle eyebrow='Moje konto' title='Zamówienia' />
      <OrdersBody isCustomer={isCustomer} />
    </div>
  );
}
