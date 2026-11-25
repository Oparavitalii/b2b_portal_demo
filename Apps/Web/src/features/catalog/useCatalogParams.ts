import {
  PRODUCT_PAGE_SIZE,
  type ProductListQuery,
} from '@catalog/shared/schemas/product';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface CatalogFilters {
  q: string;
  category: string;
  make: string;
  page: number;
}

type FilterPatch = Partial<CatalogFilters>;

export type CatalogView = 'grid' | 'list';

const VIEW_STORAGE_KEY = 'cdm.catalogView';

function readPage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

// Storage can be blocked (private mode, disabled site data): the view then
// simply falls back to the grid.
function readStoredView(): CatalogView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function storeView(view: CatalogView): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Not remembered on this device; the URL still carries the choice.
  }
}

// Filters live in the URL (?q=&kategoria=&marka=&strona=), so a link or a
// reload keeps them. Changing any filter returns to page 1. The view
// (?widok=lista | kafelki) is also in the URL and remembered in the browser; the grid
// is the default.
export function useCatalogParams() {
  const [params, setParams] = useSearchParams();

  // ?widok=lista / ?widok=kafelki in a shared link win over the stored choice.
  const widok = params.get('widok');
  const view: CatalogView =
    widok === 'lista'
      ? 'list'
      : widok === 'kafelki'
        ? 'grid'
        : readStoredView();

  const setView = useCallback(
    (next: CatalogView) => {
      storeView(next);
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          out.set('widok', next === 'list' ? 'lista' : 'kafelki');
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const filters: CatalogFilters = useMemo(
    () => ({
      q: params.get('q') ?? '',
      category: params.get('kategoria') ?? '',
      make: params.get('marka') ?? '',
      page: readPage(params.get('strona')),
    }),
    [params],
  );

  const query: ProductListQuery = useMemo(
    () => ({
      q: filters.q.trim() || undefined,
      category: filters.category || undefined,
      make: filters.make || undefined,
      page: filters.page,
      pageSize: PRODUCT_PAGE_SIZE,
    }),
    [filters],
  );

  const update = useCallback(
    (patch: FilterPatch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const set = (key: string, value: string) => {
            if (value) next.set(key, value);
            else next.delete(key);
          };
          if (patch.q !== undefined) set('q', patch.q);
          if (patch.category !== undefined) set('kategoria', patch.category);
          if (patch.make !== undefined) set('marka', patch.make);
          const page = patch.page ?? 1;
          set('strona', page > 1 ? String(page) : '');
          return next;
        },
        { replace: patch.page === undefined },
      );
    },
    [setParams],
  );

  // Clears the filters only; the chosen view stays.
  const reset = useCallback(
    () =>
      setParams(
        (prev) => {
          const out = new URLSearchParams();
          const widok = prev.get('widok');
          if (widok) out.set('widok', widok);
          return out;
        },
        { replace: true },
      ),
    [setParams],
  );

  return { filters, query, update, reset, view, setView };
}
