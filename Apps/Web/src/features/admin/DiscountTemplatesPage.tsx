import type { DiscountTemplate } from '@catalog/shared/schemas/admin';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Table,
  Text,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';
import { apiErrorMessage } from '@/lib/http';
import { formatDateTime } from '@/lib/format';

import classes from './Admin.module.css';
import { AdminNav } from './AdminNav';
import {
  discountErrorMessage,
  useDeleteDiscountTemplate,
  useDiscountTemplates,
} from './api';
import { ruleText } from './DiscountRulesEditor';

function rulesSummary(t: DiscountTemplate): string {
  const categories = t.rules.filter((r) => r.type === 'category').length;
  const products = t.rules.length - categories;
  if (t.rules.length === 0) return 'Brak reguł';
  return [
    categories > 0 ? `kategorie: ${categories}` : null,
    products > 0 ? `produkty: ${products}` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

// Szablony rabatów (Pilot_Run 2026-10-16): named sets of per-category / per-product %
// that a customer can be linked to in "Klienci i rabaty". Editing one moves the prices of
// every linked customer at once; sent orders keep theirs. Creating / editing happens on
// its own page with the full product list (DiscountTemplateEditPage).
export function DiscountTemplatesPage() {
  const templates = useDiscountTemplates();
  const remove = useDeleteDiscountTemplate();
  const navigate = useNavigate();
  const rows = templates.data ?? [];

  const confirmDelete = (t: DiscountTemplate) =>
    modals.openConfirmModal({
      title: 'Usunąć szablon rabatów?',
      children: (
        <Text size='sm'>
          Szablon „{t.name}” zostanie usunięty.
          {t.customersCount > 0
            ? ` ${t.customersCount} klient(ów) straci ten szablon — zostają im własne rabaty i rabat ogólny.`
            : ''}{' '}
          Wysłane zamówienia się nie zmienią.
        </Text>
      ),
      labels: { confirm: 'Usuń szablon', cancel: 'Anuluj' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(t.id, {
          onSuccess: () =>
            notifications.show({
              color: 'green',
              message: `Usunięto szablon: ${t.name}`,
            }),
          onError: (err) =>
            notifications.show({
              color: 'red',
              title: 'Nie usunięto szablonu',
              message: discountErrorMessage(err),
              autoClose: 8000,
            }),
        }),
    });

  return (
    <>
      <PageTitle
        eyebrow='Panel administratora'
        title='Szablony rabatów'
        lead='Szablon to zestaw rabatów na kategorie i produkty. Przypisz go klientom w „Klienci i rabaty” — zmiana szablonu od razu zmienia ich ceny.'
      />
      <AdminNav />

      <div className={classes.toolbar}>
        <Button
          color='cdmInk'
          leftSection={<Plus size={16} aria-hidden />}
          onClick={() => navigate('/admin/rabaty/nowy')}
        >
          Nowy szablon
        </Button>
        <Text size='sm' className={classes.muted}>
          {templates.isFetching ? (
            <Loader size='xs' />
          ) : (
            `Szablonów: ${rows.length}`
          )}
        </Text>
      </div>

      {templates.isError ? (
        <Alert color='red' title='Nie udało się pobrać szablonów'>
          {apiErrorMessage(templates.error)}
        </Alert>
      ) : templates.isPending ? (
        <Loader />
      ) : rows.length === 0 ? (
        <Text className={classes.muted}>
          Brak szablonów. Utwórz pierwszy przyciskiem „Nowy szablon”.
        </Text>
      ) : (
        <div className={classes.tableBox}>
          <Table striped highlightOnHover verticalSpacing='sm'>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nazwa</Table.Th>
                <Table.Th>Rabaty</Table.Th>
                <Table.Th>Klienci</Table.Th>
                <Table.Th>Zmieniono</Table.Th>
                <Table.Th>Akcje</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>
                    <strong>{t.name}</strong>
                  </Table.Td>
                  <Table.Td>
                    <Text size='sm'>{rulesSummary(t)}</Text>
                    <div className={classes.ruleChips}>
                      {t.rules.slice(0, 4).map((r) => (
                        <Badge
                          key={`${r.type}:${r.target}`}
                          variant='light'
                          color='gray'
                          radius='sm'
                          tt='none'
                        >
                          {ruleText(r)}
                        </Badge>
                      ))}
                      {t.rules.length > 4 ? (
                        <Text size='xs' className={classes.muted}>
                          +{t.rules.length - 4}
                        </Text>
                      ) : null}
                    </div>
                  </Table.Td>
                  <Table.Td>{t.customersCount}</Table.Td>
                  <Table.Td className={classes.nowrap}>
                    {formatDateTime(t.updatedAt)}
                  </Table.Td>
                  <Table.Td>
                    <Group gap='xs' wrap='nowrap'>
                      <Button
                        size='xs'
                        variant='light'
                        color='cdmInk'
                        leftSection={<Pencil size={14} aria-hidden />}
                        component={Link}
                        to={`/admin/rabaty/${t.id}`}
                        aria-label={`Edytuj szablon ${t.name}`}
                      >
                        Edytuj
                      </Button>
                      <Button
                        size='xs'
                        variant='subtle'
                        color='red'
                        leftSection={<Trash2 size={14} aria-hidden />}
                        onClick={() => confirmDelete(t)}
                        aria-label={`Usuń szablon ${t.name}`}
                      >
                        Usuń
                      </Button>
                    </Group>
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
