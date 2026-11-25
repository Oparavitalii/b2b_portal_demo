import {
  type Cart,
  cartSchema,
  type PutCartItemPayload,
} from '@catalog/shared/schemas/cart';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiErrorMessage, apiFetch } from '@/lib/http';

// /api/cart (R-05). The key ['cart'] is shared with SiteHeader (cart count)
// and invalidated by the catalogue after "Dodaj do koszyka".
export const cartKey = ['cart'] as const;

export async function fetchCart(signal?: AbortSignal): Promise<Cart> {
  return cartSchema.parse(await apiFetch<unknown>('/cart', { signal }));
}

export function useCart() {
  return useQuery<Cart>({
    queryKey: cartKey,
    queryFn: ({ signal }) => fetchCart(signal),
  });
}

/** PUT /api/cart/items — sets the quantity of a line (0 removes it). */
export function useSetCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PutCartItemPayload) =>
      cartSchema.parse(
        await apiFetch<unknown>('/cart/items', {
          method: 'PUT',
          body: payload,
        }),
      ),
    onSuccess: (cart) => queryClient.setQueryData(cartKey, cart),
    // The server cart wins after a failed change (e.g. product withdrawn).
    onError: (err) => {
      notifications.show({
        color: 'red',
        title: 'Nie zmieniono koszyka',
        message: apiErrorMessage(err),
        autoClose: 8000,
      });
      void queryClient.invalidateQueries({ queryKey: cartKey });
    },
  });
}

/** DELETE /api/cart. */
export function useClearCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/cart', { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: cartKey }),
  });
}
