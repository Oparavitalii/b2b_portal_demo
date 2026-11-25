import {
  type AdminOrderList,
  adminOrderListSchema,
  type AdminProductDetail,
  adminProductDetailSchema,
  type AdminProductList,
  adminProductListSchema,
  type AdminProductOptions,
  adminProductOptionsSchema,
  adminProductSkusSchema,
  type BulkProductInput,
  type BulkProductResult,
  bulkProductResultSchema,
  type CustomerAdmin,
  customerAdminListSchema,
  customerAdminSchema,
  type CustomerDiscounts,
  type CustomerDiscountsInput,
  customerDiscountsSchema,
  type DiscountTemplate,
  type DiscountTemplateInput,
  discountTemplateListSchema,
  discountTemplateSchema,
  type ImportResult,
  importResultSchema,
  type ProductInput,
} from '@catalog/shared/schemas/admin';
import { type Order, orderSchema } from '@catalog/shared/schemas/order';
import {
  type CreateShipmentInput,
  type InpostConfig,
  inpostConfigSchema,
  type Point,
  pointListSchema,
  pointSchema,
  type Shipment,
  SHIPMENT_ERROR_MESSAGES,
  shipmentSchema,
  type ShippingInfo,
  shippingInfoSchema,
} from '@catalog/shared/schemas/shipment';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiErrorMessage, apiFetch, parseApiError } from '@/lib/http';

// Query keys of the admin feature. A discount change or an import also makes
// the catalogue / cart stale (prices and product set), so those are invalidated.
export const adminKeys = {
  all: ['admin'] as const,
  customers: (q: string) => ['admin', 'customers', q] as const,
  products: (q: string, category: string, page: number) =>
    ['admin', 'products', q, category, page] as const,
  orders: (q: string, page: number) => ['admin', 'orders', q, page] as const,
  order: (id: string) => ['admin', 'order', id] as const,
  product: (sku: string) => ['admin', 'product', sku] as const,
  productOptions: ['admin', 'product-options'] as const,
  discountTemplates: ['admin', 'discount-templates'] as const,
  customerDiscounts: (id: string) =>
    ['admin', 'customer-discounts', id] as const,
  shipping: (orderId: string) => ['admin', 'shipping', orderId] as const,
  inpostConfig: ['admin', 'inpost-config'] as const,
  points: (postCode: string) => ['admin', 'inpost-points', postCode] as const,
};

export const ADMIN_PRODUCTS_PAGE_SIZE = 50;
export const ADMIN_ORDERS_PAGE_SIZE = 50;

export function useCustomers(q: string) {
  return useQuery<CustomerAdmin[]>({
    queryKey: adminKeys.customers(q),
    queryFn: async ({ signal }) =>
      customerAdminListSchema.parse(
        await apiFetch<unknown>('/admin/customers', {
          query: q ? { q } : {},
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; discountPercent: number }) =>
      customerAdminSchema.parse(
        await apiFetch<unknown>(
          `/admin/customers/${encodeURIComponent(input.id)}`,
          {
            method: 'PATCH',
            body: { discountPercent: input.discountPercent },
          },
        ),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['cart'] }),
      ]);
    },
  });
}

/** category '' = every category. */
export function useAdminProducts(q: string, category: string, page: number) {
  return useQuery<AdminProductList>({
    queryKey: adminKeys.products(q, category, page),
    queryFn: async ({ signal }) =>
      adminProductListSchema.parse(
        await apiFetch<unknown>('/admin/products', {
          query: {
            ...(q ? { q } : {}),
            ...(category ? { category } : {}),
            page,
            pageSize: ADMIN_PRODUCTS_PAGE_SIZE,
          },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** Sends the file text as-is (raw JSON body, up to 20 MB on the API side). */
export function useImportProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jsonText: string): Promise<ImportResult> =>
      importResultSchema.parse(
        await apiFetch<unknown>('/admin/products/import', {
          method: 'POST',
          body: jsonText,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'products'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['cart'] }),
      ]);
    },
  });
}

/** The whole catalogue as .xlsx (every product, hidden ones too), saved by the browser. */
export function useExportProducts() {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const blob = await apiFetch<Blob>('/admin/products/export', {
        responseType: 'blob',
      });
      const today = new Date().toISOString().slice(0, 10).replaceAll('-', '_');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Katalog_Catalog_${today}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
}

/** Block (true) or unblock (false): a blocked customer cannot log in. */
export function useSetCustomerBlocked() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; blocked: boolean }) =>
      customerAdminSchema.parse(
        await apiFetch<unknown>(
          `/admin/customers/${encodeURIComponent(input.id)}/${input.blocked ? 'block' : 'unblock'}`,
          { method: 'POST' },
        ),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
  });
}

/** Deletes the account; the customer's orders stay (snapshots). */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/customers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] }),
      ]);
    },
  });
}

export function useAdminOrders(q: string, page: number) {
  return useQuery<AdminOrderList>({
    queryKey: adminKeys.orders(q, page),
    queryFn: async ({ signal }) =>
      adminOrderListSchema.parse(
        await apiFetch<unknown>('/admin/orders', {
          query: {
            ...(q ? { q } : {}),
            page,
            pageSize: ADMIN_ORDERS_PAGE_SIZE,
          },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrder(id: string) {
  return useQuery<Order>({
    queryKey: adminKeys.order(id),
    queryFn: async ({ signal }) =>
      orderSchema.parse(
        await apiFetch<unknown>(`/admin/orders/${encodeURIComponent(id)}`, {
          signal,
        }),
      ),
    enabled: id !== '',
  });
}

// ---------- product editing (Pilot_Run 2026-10-10) ----------

const productPath = (sku: string) =>
  `/admin/products/${encodeURIComponent(sku)}`;

/** A saved product changes the admin list, the catalogue and every cart line. */
function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return async (saved?: AdminProductDetail) => {
    if (saved) queryClient.setQueryData(adminKeys.product(saved.sku), saved);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] }),
      queryClient.invalidateQueries({ queryKey: adminKeys.productOptions }),
      queryClient.invalidateQueries({ queryKey: ['catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['cart'] }),
    ]);
  };
}

export function useAdminProduct(sku: string | null) {
  return useQuery<AdminProductDetail>({
    queryKey: adminKeys.product(sku ?? ''),
    queryFn: async ({ signal }) =>
      adminProductDetailSchema.parse(
        await apiFetch<unknown>(productPath(sku ?? ''), { signal }),
      ),
    enabled: sku !== null && sku !== '',
  });
}

export function useProductOptions() {
  return useQuery<AdminProductOptions>({
    queryKey: adminKeys.productOptions,
    queryFn: async ({ signal }) =>
      adminProductOptionsSchema.parse(
        await apiFetch<unknown>('/admin/products/options', { signal }),
      ),
    staleTime: 60_000,
  });
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async (input: ProductInput) =>
      adminProductDetailSchema.parse(
        await apiFetch<unknown>('/admin/products', {
          method: 'POST',
          body: input,
        }),
      ),
    onSuccess: invalidate,
  });
}

/** PATCH: only the fields sent change (the table sends stock / leadTimeHours alone). */
export function useUpdateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async (input: {
      sku: string;
      patch: Partial<Omit<ProductInput, 'sku'>>;
    }) =>
      adminProductDetailSchema.parse(
        await apiFetch<unknown>(productPath(input.sku), {
          method: 'PATCH',
          body: input.patch,
        }),
      ),
    onSuccess: invalidate,
  });
}

/** Every SKU the search matches — "select all" for the bulk edit (asked on demand). */
export function useProductSkus() {
  return useMutation({
    mutationFn: async ({ q, category }: { q: string; category: string }) =>
      adminProductSkusSchema.parse(
        await apiFetch<unknown>('/admin/products/skus', {
          query: { ...(q ? { q } : {}), ...(category ? { category } : {}) },
        }),
      ).skus,
  });
}

/** One change (price, stock, delivery time) for many products. */
export function useBulkUpdateProducts() {
  const invalidate = useInvalidateProducts();
  const queryClient = useQueryClient();
  return useMutation<BulkProductResult, unknown, BulkProductInput>({
    mutationFn: async (input) =>
      bulkProductResultSchema.parse(
        await apiFetch<unknown>('/admin/products/bulk', {
          method: 'POST',
          body: input,
        }),
      ),
    onSuccess: async () => {
      // Open product forms would otherwise show the values from before the change.
      queryClient.removeQueries({ queryKey: ['admin', 'product'] });
      await invalidate();
    },
  });
}

/** Raw jpg / png / webp body, up to 5 MB. */
export function useUploadProductImage() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async (input: { sku: string; file: File }) =>
      adminProductDetailSchema.parse(
        await apiFetch<unknown>(`${productPath(input.sku)}/image`, {
          method: 'POST',
          body: input.file,
          headers: {
            'Content-Type': input.file.type || 'application/octet-stream',
          },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useRemoveProductImage() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async (sku: string) =>
      adminProductDetailSchema.parse(
        await apiFetch<unknown>(`${productPath(sku)}/image`, {
          method: 'DELETE',
        }),
      ),
    onSuccess: invalidate,
  });
}

// ---------- InPost shipments (B-22: R-02, R-04, R-05, R-06, R-09) ----------

/**
 * A file download (responseType 'blob') gets its JSON error body as a Blob too;
 * turn it back into an object so parseApiError sees `error` / `meta`.
 */
async function decodeBlobError(err: unknown): Promise<unknown> {
  if (!err || typeof err !== 'object' || !('response' in err)) return err;
  const response = (err as { response?: { _data?: unknown } }).response;
  if (!response || !(response._data instanceof Blob)) return err;
  try {
    response._data = JSON.parse(await response._data.text()) as unknown;
  } catch {
    response._data = undefined;
  }
  return err;
}

/** ShipX `details` is usually {field: [codes]} — flattened to "field: code, code". */
function formatInpostDetails(details: unknown): string {
  if (details === null || details === undefined || details === '') return '';
  if (typeof details === 'string') return `Szczegóły: ${details}`;
  const lines: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (lines.length >= 8) return;
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v !== 'object' || v === null)) {
        lines.push(`${path || 'błąd'}: ${value.map(String).join(', ')}`);
      } else {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
      }
    } else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        walk(v, path ? `${path}.${key}` : key);
      }
    } else if (value !== null && value !== undefined) {
      lines.push(`${path || 'błąd'}: ${String(value)}`);
    }
  };
  walk(details, '');
  return lines.length > 0 ? `Szczegóły: ${lines.join('; ')}.` : '';
}

/**
 * Polish text of a shipment-endpoint error. For `inpost_error` it carries
 * InPost's own message (meta.message) and details, so the admin sees why ShipX
 * refused (R-09).
 */
export function shipmentErrorText(err: unknown): string {
  const info = parseApiError(err);
  if (info.code === 'inpost_error') {
    const meta = info.meta ?? {};
    const parts: string[] = [SHIPMENT_ERROR_MESSAGES.inpost_error ?? ''];
    if (typeof meta.message === 'string' && meta.message !== '') {
      parts.push(meta.message);
    }
    const details = formatInpostDetails(meta.details);
    if (details) parts.push(details);
    if (typeof meta.status === 'number' && meta.status > 0) {
      parts.push(`(HTTP ${meta.status} z InPost)`);
    }
    return parts.filter(Boolean).join(' ');
  }
  const known = info.code ? SHIPMENT_ERROR_MESSAGES[info.code] : undefined;
  return known ?? apiErrorMessage(err);
}

export function useOrderShipping(orderId: string) {
  return useQuery<ShippingInfo>({
    queryKey: adminKeys.shipping(orderId),
    queryFn: async ({ signal }) =>
      shippingInfoSchema.parse(
        await apiFetch<unknown>(
          `/admin/orders/${encodeURIComponent(orderId)}/shipping`,
          { signal },
        ),
      ),
    enabled: orderId !== '',
  });
}

/** Geowidget token (admins only, R-08). */
export function useInpostConfig() {
  return useQuery<InpostConfig>({
    queryKey: adminKeys.inpostConfig,
    queryFn: async ({ signal }) =>
      inpostConfigSchema.parse(
        await apiFetch<unknown>('/admin/inpost/config', { signal }),
      ),
    staleTime: Infinity,
  });
}

/** The 5 nearest working lockers to a post code ('' = not asked yet). */
export function useInpostPoints(postCode: string) {
  return useQuery<Point[]>({
    queryKey: adminKeys.points(postCode),
    queryFn: async ({ signal }) =>
      pointListSchema.parse(
        await apiFetch<unknown>('/admin/inpost/points', {
          query: { postCode },
          signal,
        }),
      ).items,
    enabled: postCode !== '',
    staleTime: 10 * 60_000,
  });
}

/** One point by its code — validates a typed or map-picked code (404 = unknown). */
export function useLookupPoint() {
  return useMutation<Point, unknown, string>({
    mutationFn: async (name) =>
      pointSchema.parse(
        await apiFetch<unknown>(
          `/admin/inpost/points/${encodeURIComponent(name.trim().toUpperCase())}`,
        ),
      ),
    meta: { errorHandled: true },
  });
}

function useInvalidateShipping(orderId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.shipping(orderId) }),
      queryClient.invalidateQueries({ queryKey: adminKeys.order(orderId) }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] }),
    ]);
  };
}

/** Buys the shipment (paid). A failure stores nothing on the API side (R-09). */
export function useCreateShipment(orderId: string) {
  const invalidate = useInvalidateShipping(orderId);
  return useMutation<Shipment, unknown, CreateShipmentInput>({
    mutationFn: async (input) =>
      shipmentSchema.parse(
        await apiFetch<unknown>(
          `/admin/orders/${encodeURIComponent(orderId)}/shipments`,
          { method: 'POST', body: input },
        ),
      ),
    meta: { errorHandled: true },
    onSuccess: invalidate,
  });
}

/** Asks InPost for the current status and tracking number right now. */
export function useRefreshShipment(orderId: string) {
  const invalidate = useInvalidateShipping(orderId);
  return useMutation<Shipment, unknown, string>({
    mutationFn: async (shipmentId) =>
      shipmentSchema.parse(
        await apiFetch<unknown>(
          `/admin/shipments/${encodeURIComponent(shipmentId)}/refresh`,
          { method: 'POST' },
        ),
      ),
    meta: { errorHandled: true },
    onSuccess: invalidate,
  });
}

/** Label PDF A6, saved by the browser (409 label_not_ready before `confirmed`). */
export function useDownloadLabel() {
  return useMutation<void, unknown, Shipment>({
    mutationFn: async (shipment) => {
      let blob: Blob;
      try {
        blob = await apiFetch<Blob>(
          `/admin/shipments/${encodeURIComponent(shipment.id)}/label`,
          { responseType: 'blob' },
        );
      } catch (err) {
        throw await decodeBlobError(err);
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Etykieta_InPost_${shipment.trackingNumber ?? shipment.id}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    meta: { errorHandled: true },
  });
}

// Per-product rabaty and szablony rabatów (Pilot_Run 2026-10-16). Every change moves
// prices, so the catalogue and the cart are invalidated like a discount change.
async function invalidatePrices(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
    queryClient.invalidateQueries({ queryKey: adminKeys.discountTemplates }),
    queryClient.invalidateQueries({
      queryKey: ['admin', 'customer-discounts'],
    }),
    queryClient.invalidateQueries({ queryKey: ['catalog'] }),
    queryClient.invalidateQueries({ queryKey: ['cart'] }),
  ]);
}

export function useDiscountTemplates() {
  return useQuery<DiscountTemplate[]>({
    queryKey: adminKeys.discountTemplates,
    queryFn: async ({ signal }) =>
      discountTemplateListSchema.parse(
        await apiFetch<unknown>('/admin/discount-templates', { signal }),
      ),
  });
}

/** id null = create a new szablon, otherwise replace its name and rules. */
export function useSaveDiscountTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string | null;
      body: DiscountTemplateInput;
    }) =>
      discountTemplateSchema.parse(
        await apiFetch<unknown>(
          input.id === null
            ? '/admin/discount-templates'
            : `/admin/discount-templates/${encodeURIComponent(input.id)}`,
          { method: input.id === null ? 'POST' : 'PUT', body: input.body },
        ),
      ),
    onSuccess: (saved) => {
      // In the list at once: the editor page moves from /nowy to /:id right after a create.
      queryClient.setQueryData<DiscountTemplate[]>(
        adminKeys.discountTemplates,
        (list) => [...(list ?? []).filter((t) => t.id !== saved.id), saved],
      );
      return invalidatePrices(queryClient);
    },
    // The forms show discountErrorMessage themselves.
    meta: { errorHandled: true },
  });
}

/** Its customers are unlinked and keep their own rules and global %. */
export function useDeleteDiscountTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/discount-templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidatePrices(queryClient),
    // The forms show discountErrorMessage themselves.
    meta: { errorHandled: true },
  });
}

export function useCustomerDiscounts(id: string | null) {
  return useQuery<CustomerDiscounts>({
    queryKey: adminKeys.customerDiscounts(id ?? ''),
    queryFn: async ({ signal }) =>
      customerDiscountsSchema.parse(
        await apiFetch<unknown>(
          `/admin/customers/${encodeURIComponent(id ?? '')}/discounts`,
          { signal },
        ),
      ),
    enabled: id !== null,
  });
}

export function useSaveCustomerDiscounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; body: CustomerDiscountsInput }) =>
      customerDiscountsSchema.parse(
        await apiFetch<unknown>(
          `/admin/customers/${encodeURIComponent(input.id)}/discounts`,
          { method: 'PUT', body: input.body },
        ),
      ),
    onSuccess: () => invalidatePrices(queryClient),
    // The forms show discountErrorMessage themselves.
    meta: { errorHandled: true },
  });
}

/** Polish message for the discount API errors. */
export function discountErrorMessage(err: unknown): string {
  const { code, meta } = parseApiError(err);
  const target = typeof meta?.target === 'string' ? meta.target : '';
  switch (code) {
    case 'invalid_discount':
      return 'Rabat: od 0 do 100%, co 0,5 punktu procentowego.';
    case 'duplicate_rule':
      return `Pozycja „${target}” jest na liście dwa razy.`;
    case 'unknown_target':
      return meta?.type === 'product'
        ? `Nie ma produktu o SKU „${target}”.`
        : `Nie ma kategorii „${target}”.`;
    case 'template_name_taken':
      return 'Szablon o tej nazwie już istnieje.';
    default:
      return apiErrorMessage(err);
  }
}
