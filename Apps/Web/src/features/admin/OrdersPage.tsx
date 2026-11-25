import {
  Alert,
  Badge,
  Loader,
  Pagination,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';
import { formatDateTime, formatNip, formatPLN } from '@/lib/format';
import { apiErrorMessage } from '@/lib/http';

import { ShipmentCell } from '../orders/ShipmentStatus';
import classes from './Admin.module.css';
import { AdminNav } from './AdminNav';
import { ADMIN_ORDERS_PAGE_SIZE, useAdminOrders } from './api';

// Every order received, newest first — before this the only trace was the
// company e-mail. Read-only: orders have no statuses (N-04); the last column
// is the latest InPost shipment status (B-22).
export function OrdersPage() {
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const orders = useAdminOrders(q, page);
  const data = orders.data;
  const pages = data
    ? Math.max(1, Math.ceil(data.total / ADMIN_ORDERS_PAGE_SIZE))
    : 1;

  return (
    <>
      <PageTitle
        eyebrow='Panel administratora'
        title='Zamówienia'
        lead='Wszystkie zamówienia wysłane z katalogu, z cenami z chwili wysłania.'
      />
      <AdminNav />

      <div className={classes.toolbar}>
        <TextInput
          label='Szukaj zamówienia'
          placeholder='Numer, firma, NIP lub e-mail'
          leftSection={<Search size={16} aria-hidden />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Text size='sm' className={classes.muted}>
          {orders.isFetching ? (
            <Loader size='xs' />
          ) : (
            `Zamówień: ${data?.total ?? 0}`
          )}
        </Text>
      </div>

      {orders.isError ? (
        <Alert color='red' title='Nie udało się pobrać zamówień'>
          {apiErrorMessage(orders.error)}
        </Alert>
      ) : orders.isPending ? (
        <Loader />
      ) : !data || data.items.length === 0 ? (
        <Text className={classes.muted}>
          {q
            ? 'Brak zamówień pasujących do wyszukiwania.'
            : 'Nie otrzymano jeszcze żadnego zamówienia.'}
        </Text>
      ) : (
        <>
          <div className={classes.tableBox}>
            <Table striped highlightOnHover verticalSpacing='sm'>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Numer</Table.Th>
                  <Table.Th>Data</Table.Th>
                  <Table.Th>Firma</Table.Th>
                  <Table.Th>NIP</Table.Th>
                  <Table.Th>E-mail</Table.Th>
                  <Table.Th>Pozycje</Table.Th>
                  <Table.Th>Razem z kaucją</Table.Th>
                  <Table.Th>Wysyłka</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td className={classes.nowrap}>
                      <Link to={`/admin/zamowienia/${o.id}`}>{o.number}</Link>
                      {o.hasPriceOnRequest ? (
                        <Text size='xs' className={classes.muted}>
                          z ceną na zapytanie
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td className={classes.nowrap}>
                      {formatDateTime(o.createdAt)}
                    </Table.Td>
                    <Table.Td>
                      {o.customer.companyName ?? '—'}
                      {o.accountDeleted ? (
                        <Badge ml='xs' color='gray' variant='light'>
                          Konto usunięte
                        </Badge>
                      ) : null}
                    </Table.Td>
                    <Table.Td className={classes.nowrap}>
                      {o.customer.nip ? formatNip(o.customer.nip) : '—'}
                    </Table.Td>
                    <Table.Td>{o.customer.email ?? '—'}</Table.Td>
                    <Table.Td>{o.itemsCount}</Table.Td>
                    <Table.Td className={classes.nowrap}>
                      <strong>{formatPLN(o.totals.grossWithDeposit)}</strong>
                    </Table.Td>
                    <Table.Td>
                      <ShipmentCell shipment={o.shipment} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
          {pages > 1 ? (
            <Pagination
              mt='md'
              total={pages}
              value={page}
              onChange={setPage}
              color='cdmInk'
            />
          ) : null}
        </>
      )}
    </>
  );
}
