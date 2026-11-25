import { Alert, Badge, Loader, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { PageTitle } from '@/components/PageTitle';
import { apiErrorMessage } from '@/lib/http';
import { formatNip } from '@/lib/format';

import classes from './Admin.module.css';
import { AdminNav } from './AdminNav';
import { useCustomers } from './api';
import { CustomerActions } from './CustomerActions';
import { CustomerDiscountsCell } from './CustomerDiscounts';
import { DiscountEditor } from './DiscountEditor';

// R-02: customers with their catalogue discount (one global %), per-product rabaty
// (szablon + own rules, Pilot_Run 2026-10-16), plus block / unblock and delete per account.
export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  const customers = useCustomers(q);
  const rows = customers.data ?? [];

  return (
    <>
      <PageTitle
        eyebrow='Panel administratora'
        title='Klienci i rabaty'
        lead='Rabat ogólny obejmuje cały katalog. Rabaty produktowe (szablon albo własne) mają pierwszeństwo dla wybranych kategorii i produktów. Rabat liczony jest od ceny produktu, nie od kaucji.'
      />
      <AdminNav />

      <div className={classes.toolbar}>
        <TextInput
          label='Szukaj klienta'
          placeholder='Firma, NIP, osoba lub e-mail'
          leftSection={<Search size={16} aria-hidden />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Text size='sm' className={classes.muted}>
          {customers.isFetching ? (
            <Loader size='xs' />
          ) : (
            `Klientów: ${rows.length}`
          )}
        </Text>
      </div>

      {customers.isError ? (
        <Alert color='red' title='Nie udało się pobrać listy klientów'>
          {apiErrorMessage(customers.error)}
        </Alert>
      ) : customers.isPending ? (
        <Loader />
      ) : rows.length === 0 ? (
        <Text className={classes.muted}>
          {q
            ? 'Brak klientów pasujących do wyszukiwania.'
            : 'Brak zarejestrowanych klientów.'}
        </Text>
      ) : (
        <div className={classes.tableBox}>
          <Table striped highlightOnHover verticalSpacing='sm'>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Firma</Table.Th>
                <Table.Th>NIP</Table.Th>
                <Table.Th>Osoba</Table.Th>
                <Table.Th>E-mail</Table.Th>
                <Table.Th>Telefon</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Rabat ogólny %</Table.Th>
                <Table.Th>Rabaty produktowe</Table.Th>
                <Table.Th>Konto</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.companyName ?? '—'}</Table.Td>
                  <Table.Td className={classes.nowrap}>
                    {c.nip ? formatNip(c.nip) : '—'}
                  </Table.Td>
                  <Table.Td>{c.contactName ?? '—'}</Table.Td>
                  <Table.Td>{c.email}</Table.Td>
                  <Table.Td className={classes.nowrap}>
                    {c.phone ?? '—'}
                  </Table.Td>
                  <Table.Td>
                    {c.blockedAt !== null ? (
                      <Badge color='red' variant='light'>
                        Zablokowany
                      </Badge>
                    ) : c.status === 'active' ? (
                      <Badge color='green' variant='light'>
                        Aktywny
                      </Badge>
                    ) : (
                      <Badge color='gray' variant='light'>
                        Niepotwierdzony
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <DiscountEditor
                      customerId={c.id}
                      companyLabel={c.companyName ?? c.email}
                      value={c.discountPercent}
                    />
                  </Table.Td>
                  <Table.Td>
                    <CustomerDiscountsCell customer={c} />
                  </Table.Td>
                  <Table.Td>
                    <CustomerActions customer={c} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </>
  );
}
