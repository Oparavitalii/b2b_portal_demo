import {
  Alert,
  Button,
  Pagination,
  SegmentedControl,
  Skeleton,
  VisuallyHidden,
} from '@mantine/core';
import { LayoutGrid, List, PackageSearch } from 'lucide-react';

import { PageTitle } from '@/components/PageTitle';
import { apiErrorMessage } from '@/lib/http';

import { useProducts } from './api';
import classes from './Catalog.module.css';
import { CatalogFilters } from './CatalogFilters';
import { DiscountBadge } from './DiscountBadge';
import { ProductTile } from './ProductTile';
import { type CatalogView, useCatalogParams } from './useCatalogParams';

const SKELETON_COUNT = 8;

const VIEW_OPTIONS = [
  {
    value: 'grid',
    label: (
      <>
        <LayoutGrid size={18} aria-hidden />
        <VisuallyHidden>Widok: kafelki</VisuallyHidden>
      </>
    ),
  },
  {
    value: 'list',
    label: (
      <>
        <List size={18} aria-hidden />
        <VisuallyHidden>Widok: lista</VisuallyHidden>
      </>
    ),
  },
];

function resultLabel(total: number): string {
  const mod10 = total % 10;
  const mod100 = total % 100;
  if (total === 1) return '1 produkt';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${total} produkty`;
  return `${total} produktów`;
}

function CatalogSkeleton({ view }: { view: CatalogView }) {
  const isList = view === 'list';
  return (
    <div
      className={isList ? classes.list : classes.grid}
      aria-busy='true'
      aria-label='Ładowanie'
    >
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <div
          key={i}
          className={
            isList ? `${classes.card} ${classes.cardList}` : classes.card
          }
        >
          <Skeleton className={classes.media} radius={0} />
          <div className={classes.cardBody}>
            <div className={classes.info}>
              <Skeleton height={10} width='40%' />
              <Skeleton height={18} mt={6} />
              {isList ? null : <Skeleton height={18} width='70%' />}
            </div>
            <div className={classes.priceArea}>
              <Skeleton height={26} width={isList ? 120 : '55%'} />
              {isList ? <Skeleton height={30} width={110} /> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// R-17 / R-21 / R-22 — catalogue (behind login): OE / SKU / name search,
// category + vehicle make filters, paginated grid with the user's prices.
export function CatalogPage() {
  const { filters, query, update, reset, view, setView } = useCatalogParams();
  const isList = view === 'list';
  const { data, isPending, isError, error, isPlaceholderData, refetch } =
    useProducts(query);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = Boolean(filters.q || filters.category || filters.make);

  return (
    <div>
      <PageTitle
        eyebrow='Katalog B2B'
        title='Części regenerowane DEMO PARTS'
        lead='Wtryskiwacze, pompy CR i zbiorniki AdBlue. Ceny netto uwzględniają twój rabat. Kaucja: bez rabatu, VAT 0%.'
      />

      <CatalogFilters
        filters={filters}
        categories={data?.facets.categories ?? []}
        makes={data?.facets.makes ?? []}
        onChange={update}
      />

      {isError ? (
        <Alert color='gray' title='Nie udało się wczytać katalogu' mb='md'>
          {apiErrorMessage(error)}{' '}
          <Button variant='subtle' size='compact-sm' onClick={() => refetch()}>
            Spróbuj ponownie
          </Button>
        </Alert>
      ) : null}

      {data ? (
        <div className={classes.summary}>
          <span aria-live='polite'>Znaleziono: {resultLabel(data.total)}</span>
          <div className={classes.summaryEnd}>
            <DiscountBadge
              percent={data.discountPercent}
              perProduct={data.productDiscounts}
            />
            <div role='group' aria-label='Widok katalogu'>
              <SegmentedControl
                size='xs'
                value={view}
                onChange={(value) =>
                  setView(value === 'list' ? 'list' : 'grid')
                }
                data={VIEW_OPTIONS}
              />
            </div>
          </div>
        </div>
      ) : null}

      {isPending ? <CatalogSkeleton view={view} /> : null}

      {data && data.items.length === 0 ? (
        <div className={classes.empty}>
          <PackageSearch size={40} strokeWidth={1.5} aria-hidden />
          <p>Brak produktów dla wybranych filtrów</p>
          {hasFilters ? (
            <Button variant='default' onClick={reset}>
              Wyczyść filtry
            </Button>
          ) : null}
        </div>
      ) : null}

      {data && data.items.length > 0 ? (
        <div
          className={isList ? classes.list : classes.grid}
          style={{ opacity: isPlaceholderData ? 0.6 : 1 }}
        >
          {data.items.map((product) => (
            <ProductTile
              key={product.sku}
              product={product}
              discountPercent={product.discountPercent}
              view={view}
            />
          ))}
        </div>
      ) : null}

      {data && pages > 1 ? (
        <div className={classes.pagination}>
          <Pagination
            total={pages}
            value={Math.min(filters.page, pages)}
            onChange={(page) => {
              update({ page });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            color='cdmInk.9'
            getControlProps={(control) => ({
              'aria-label':
                control === 'previous'
                  ? 'Poprzednia strona'
                  : control === 'next'
                    ? 'Następna strona'
                    : undefined,
            })}
          />
        </div>
      ) : null}
    </div>
  );
}
