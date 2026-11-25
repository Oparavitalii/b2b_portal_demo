import {
  type ProductDetail,
  productDetailSchema,
  type ProductListQuery,
  type ProductListResponse,
  productListResponseSchema,
  type VariantKey,
} from '@catalog/shared/schemas/product';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/http';

// Query keys of the catalogue feature. ['cart'] belongs to the cart feature
// (T-06) and is only invalidated from here.
export const catalogKeys = {
  all: ['catalog'] as const,
  list: (query: ProductListQuery) => ['catalog', 'list', query] as const,
  product: (sku: string) => ['catalog', 'product', sku] as const,
};

function toSearch(query: ProductListQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {
    page: query.page,
    pageSize: query.pageSize,
  };
  if (query.q) out.q = query.q;
  if (query.category) out.category = query.category;
  if (query.make) out.make = query.make;
  return out;
}

export function useProducts(query: ProductListQuery) {
  return useQuery<ProductListResponse>({
    queryKey: catalogKeys.list(query),
    queryFn: async ({ signal }) =>
      productListResponseSchema.parse(
        await apiFetch<unknown>('/products', {
          query: toSearch(query),
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(sku: string) {
  return useQuery<ProductDetail>({
    queryKey: catalogKeys.product(sku),
    queryFn: async ({ signal }) =>
      productDetailSchema.parse(
        await apiFetch<unknown>(`/products/${encodeURIComponent(sku)}`, {
          signal,
        }),
      ),
    enabled: sku !== '',
  });
}

export interface AddToCartInput {
  sku: string;
  variant: VariantKey | null;
  qty: number;
}

const MAX_LINE_QTY = 999;

interface CartLineLike {
  sku?: unknown;
  variant?: unknown;
  qty?: unknown;
}

// Quantity already in the cart for this sku + variant (0 when unknown).
async function currentQty(sku: string, variant: VariantKey | null) {
  try {
    const cart = await apiFetch<{ lines?: CartLineLike[] }>('/cart');
    const line = (cart.lines ?? []).find(
      (l) => l.sku === sku && (l.variant ?? null) === variant,
    );
    return typeof line?.qty === 'number' ? line.qty : 0;
  } catch {
    return 0;
  }
}

// PUT /api/cart/items (cart API: T-06) sets a line's quantity, so "add"
// = quantity already in the cart + the chosen quantity (capped at 999).
export function useAddToCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddToCartInput) => {
      const qty = Math.min(
        MAX_LINE_QTY,
        (await currentQty(input.sku, input.variant)) + input.qty,
      );
      return apiFetch<unknown>('/cart/items', {
        method: 'PUT',
        body: { sku: input.sku, variant: input.variant, qty },
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });
}
