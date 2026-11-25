import {
  type CreateOrderPayload,
  type Order,
  type OrderList,
  orderListSchema,
  orderSchema,
} from '@catalog/shared/schemas/order';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/http';

// /api/orders — sending the cart and the customer's history (R-06, R-10).
// ['cart'] is the cart feature's key (also read by SiteHeader).

export const orderKeys = {
  all: ['orders'] as const,
  list: ['orders', 'list'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};

export function useOrders(enabled = true) {
  return useQuery<OrderList>({
    queryKey: orderKeys.list,
    queryFn: async ({ signal }) =>
      orderListSchema.parse(await apiFetch<unknown>('/orders', { signal })),
    enabled,
  });
}

export function useOrder(id: string) {
  return useQuery<Order>({
    queryKey: orderKeys.detail(id),
    queryFn: async ({ signal }) =>
      orderSchema.parse(
        await apiFetch<unknown>(`/orders/${encodeURIComponent(id)}`, {
          signal,
        }),
      ),
    enabled: id !== '',
  });
}

/** POST /api/orders — the API clears the cart and e-mails the company. */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateOrderPayload) =>
      orderSchema.parse(
        await apiFetch<unknown>('/orders', { method: 'POST', body: payload }),
      ),
    // Errors are shown inline on the cart page (no global toast).
    meta: { errorHandled: true },
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      void queryClient.invalidateQueries({ queryKey: orderKeys.list });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });
}
