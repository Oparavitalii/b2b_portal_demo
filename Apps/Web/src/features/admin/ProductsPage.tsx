import type { AdminProduct } from '@catalog/shared/schemas/admin';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Pagination,
  SegmentedControl,
  Table,
  Text,
  TextInput,
  VisuallyHidden,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  CheckSquare,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  SquarePen,
} from 'lucide-react';
import { useState } from 'react';

import { PageTitle } from '@/components/PageTitle';
import { formatDateTime, formatPLN } from '@/lib/format';
import { apiErrorMessage } from '@/lib/http';

import classes from './Admin.module.css';
import { AdminNav } from './AdminNav';
import {
  ADMIN_PRODUCTS_PAGE_SIZE,
  useAdminProducts,
  useExportProducts,
  useProductOptions,
  useProductSkus,
} from './api';
import { BulkEditor } from './BulkEditor';
import { ImportPanel } from './ImportPanel';
import { ProductEditor } from './ProductEditor';
import { ProductThumb } from './ProductThumb';
import { StockEditor } from './StockEditor';

function PriceCell({ product }: { product: AdminProduct }) {
  if (product.priceOnRequest || product.priceGross === null) {
    return <Text size='sm'>Cena na zapytanie</Text>;
  }
  const { variants } = product;
  return (
    <>
      <Text size='sm' className={classes.nowrap}>
        {formatPLN(product.priceGross)} brutto
      </Text>
      {variants?.oryginalne && variants.zamienne ? (
        <Text size='xs' className={`${classes.muted} ${classes.nowrap}`}>
          oryg. {formatPLN(variants.oryginalne.priceGross)} · zam.{' '}
          {formatPLN(variants.zamienne.priceGross)}
        </Text>
      ) : null}
    </>
  );
}

function ProductRow({
  product: p,
  selected,
  onSelect,
  onEdit,
}: {
  product: AdminProduct;
  selected: boolean;
  onSelect: (sku: string, selected: boolean) => void;
  onEdit: (sku: string) => void;
}) {
  return (
    <Table.Tr>
      <Table.Td className={classes.checkCell}>
        <Checkbox
          aria-label={`Zaznacz ${p.sku}`}
          checked={selected}
          onChange={(e) => onSelect(p.sku, e.currentTarget.checked)}
        />
      </Table.Td>
      <Table.Td>
        <ProductThumb src={p.imageUrl} alt={p.name} />
      </Table.Td>
      <Table.Td className={`cdm-mono ${classes.nowrap}`}>{p.sku}</Table.Td>
      <Table.Td className={classes.nameCell}>
        <button
          type='button'
          className={classes.nameButton}
          onClick={() => onEdit(p.sku)}
        >
          {p.name}
        </button>
        {p.producer ? (
          <Text size='xs' className={classes.muted}>
            {p.producer}
          </Text>
        ) : null}
      </Table.Td>
      <Table.Td>{p.category ?? '—'}</Table.Td>
      <Table.Td>
        <PriceCell product={p} />
      </Table.Td>
      <Table.Td className={classes.nowrap}>
        {p.depositGross > 0 ? formatPLN(p.depositGross) : '—'}
      </Table.Td>
      <StockEditor product={p} />
      <Table.Td className={classes.statusCell}>
        {p.active ? (
          <Badge color='green' variant='light'>
            Aktywny
          </Badge>
        ) : (
          <Badge color='gray' variant='light'>
            Ukryty
          </Badge>
        )}
      </Table.Td>
      <Table.Td className={classes.nowrap}>
        <Text size='xs'>{p.source === 'manual' ? 'Ręcznie' : 'Import'}</Text>
        <Text size='xs' className={classes.muted}>
          {formatDateTime(p.updatedAt ?? p.importedAt)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Button
          size='xs'
          variant='default'
          leftSection={<Pencil size={14} aria-hidden />}
          aria-label={`Edytuj ${p.sku}`}
          onClick={() => onEdit(p.sku)}
        >
          Edytuj
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

// R-25: import + every product (incl. hidden ones); edit, add by hand, stock and
// delivery time per row (Pilot_Run 2026-10-10). Checked rows (kept across pages and
// searches) get one change at once in BulkEditor (owner, 2026-10-12). Category filter
// + "select all" of the filtered list for quick stock upkeep (owner, 2026-10-14).
export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  /** '' = every category. */
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  /** null = drawer closed, '' = new product, otherwise the SKU being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const products = useAdminProducts(q, category, page);
  const options = useProductOptions();
  const exportProducts = useExportProducts();
  const allSkus = useProductSkus();
  const categories = options.data?.categories ?? [];
  const data = products.data;
  const pageSkus = data?.items.map((p) => p.sku) ?? [];
  const pageChecked = pageSkus.filter((sku) => selected.has(sku)).length;

  function select(skus: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const sku of skus) {
        if (on) next.add(sku);
        else next.delete(sku);
      }
      return next;
    });
  }
  /** Checks every product the search + category filter matches (all pages). */
  function selectAll() {
    allSkus.mutate(
      { q, category },
      {
        onSuccess: (skus) => select(skus, true),
        onError: (err) =>
          notifications.show({ color: 'red', message: apiErrorMessage(err) }),
      },
    );
  }
  const filtered = q !== '' || category !== '';
  const total = data?.total ?? 0;
  const allChecked =
    total > 0 && pageSkus.length === total && pageChecked === total;
  const pages = data
    ? Math.max(1, Math.ceil(data.total / ADMIN_PRODUCTS_PAGE_SIZE))
    : 1;

  return (
    <>
      <PageTitle
        eyebrow='Panel administratora'
        title='Produkty'
        lead='Tu importujesz produkty z pliku Products_Data.json, edytujesz je, dodajesz nowe i ustawiasz stan magazynowy oraz czas wysyłki. Zaznacz kilka produktów, żeby zmienić je naraz.'
      />
      <AdminNav />
      <ImportPanel />
      <ProductEditor sku={editing} onClose={() => setEditing(null)} />
      <BulkEditor
        skus={[...selected]}
        opened={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          setSelected(new Set());
        }}
      />

      <div className={classes.toolbar}>
        <TextInput
          label='Szukaj produktu'
          placeholder='SKU, numer OE lub nazwa'
          leftSection={<Search size={16} aria-hidden />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />
        {categories.length > 1 ? (
          <div>
            <Text size='sm' fw={500} mb={4}>
              Kategoria
            </Text>
            <SegmentedControl
              aria-label='Filtruj po kategorii'
              color='cdmInk'
              value={category}
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              data={[
                { value: '', label: 'Wszystkie' },
                ...categories.map((c) => ({ value: c, label: c })),
              ]}
            />
          </div>
        ) : null}
        <Group justify='space-between' gap='sm'>
          <Text size='sm' className={classes.muted}>
            {products.isFetching ? (
              <Loader size='xs' />
            ) : (
              `Produktów: ${total}`
            )}
          </Text>
          <Group gap='sm'>
            <Button
              variant='default'
              leftSection={<CheckSquare size={16} aria-hidden />}
              loading={allSkus.isPending}
              disabled={total === 0 || allChecked}
              onClick={selectAll}
            >
              {filtered
                ? `Zaznacz wszystkie z filtra (${total})`
                : `Zaznacz wszystkie (${total})`}
            </Button>
            <Button
              variant='default'
              leftSection={<FileSpreadsheet size={16} aria-hidden />}
              loading={exportProducts.isPending}
              onClick={() =>
                exportProducts.mutate(undefined, {
                  onError: (err) =>
                    notifications.show({
                      color: 'red',
                      title: 'Nie udało się pobrać pliku Excel',
                      message: apiErrorMessage(err),
                      autoClose: 8000,
                    }),
                })
              }
            >
              Pobierz Excel
            </Button>
            <Button
              color='cdmInk'
              leftSection={<Plus size={16} aria-hidden />}
              onClick={() => setEditing('')}
            >
              Dodaj produkt
            </Button>
          </Group>
        </Group>
      </div>

      {products.isError ? (
        <Alert color='red' title='Nie udało się pobrać produktów'>
          {apiErrorMessage(products.error)}
        </Alert>
      ) : products.isPending ? (
        <Loader />
      ) : !data || data.items.length === 0 ? (
        <Text className={classes.muted}>
          {filtered
            ? 'Brak produktów pasujących do wyszukiwania lub filtra.'
            : 'Brak produktów. Zaimportuj plik Products_Data.json albo dodaj produkt.'}
        </Text>
      ) : (
        <>
          {selected.size > 0 ? (
            <div
              className={classes.bulkBar}
              role='region'
              aria-label='Zaznaczone produkty'
            >
              <Text size='sm' fw={600}>
                Zaznaczono: {selected.size}
              </Text>
              <Button
                size='xs'
                color='cdmInk'
                leftSection={<SquarePen size={14} aria-hidden />}
                onClick={() => setBulkOpen(true)}
              >
                Zmień zaznaczone
              </Button>
              <Button
                size='xs'
                variant='subtle'
                color='gray'
                onClick={() => setSelected(new Set())}
              >
                Odznacz wszystkie
              </Button>
            </div>
          ) : null}
          <div className={classes.tableBox}>
            <Table striped highlightOnHover verticalSpacing='xs'>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th className={classes.checkCell}>
                    <Checkbox
                      aria-label='Zaznacz wszystkie na stronie'
                      checked={pageChecked === pageSkus.length}
                      indeterminate={
                        pageChecked > 0 && pageChecked < pageSkus.length
                      }
                      onChange={(e) =>
                        select(pageSkus, e.currentTarget.checked)
                      }
                    />
                  </Table.Th>
                  <Table.Th>Zdjęcie</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Nazwa</Table.Th>
                  <Table.Th>Kategoria</Table.Th>
                  <Table.Th>Cena</Table.Th>
                  <Table.Th>Kaucja</Table.Th>
                  <Table.Th>Stan magazynowy</Table.Th>
                  <Table.Th>Orientacyjny czas wysyłki</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Źródło</Table.Th>
                  <Table.Th>
                    <VisuallyHidden>Akcje</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((p) => (
                  <ProductRow
                    key={p.sku}
                    product={p}
                    selected={selected.has(p.sku)}
                    onSelect={(sku, on) => select([sku], on)}
                    onEdit={setEditing}
                  />
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
