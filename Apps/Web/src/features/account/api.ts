import type {
  Address,
  AddressPayload,
  ChangePasswordPayload,
  DeleteAccountPayload,
  Me,
  UpdateMePayload,
} from '@catalog/shared/schemas/account';
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/http';

// /api/me* — "Moje konto" (R-07, R-08, R-09, R-04, R-12).

export const accountKeys = {
  me: ['account', 'me'] as const,
  address: ['account', 'address'] as const,
};

export function fetchMe(): Promise<Me> {
  return apiFetch<Me>('/me');
}

export function updateMe(payload: UpdateMePayload): Promise<Me> {
  return apiFetch<Me>('/me', { method: 'PATCH', body: payload });
}

export function changePassword(payload: ChangePasswordPayload): Promise<void> {
  return apiFetch<void>('/me/password', { method: 'POST', body: payload });
}

/** null when the customer has not saved a delivery address yet. */
export function fetchAddress(): Promise<Address | null> {
  return apiFetch<Address | null>('/me/address');
}

export function saveAddress(payload: AddressPayload): Promise<Address> {
  return apiFetch<Address>('/me/address', { method: 'PUT', body: payload });
}

export function deleteAccount(payload: DeleteAccountPayload): Promise<void> {
  return apiFetch<void>('/me', { method: 'DELETE', body: payload });
}

export function useMe() {
  return useQuery({ queryKey: accountKeys.me, queryFn: fetchMe });
}

export function useAddress() {
  return useQuery({
    queryKey: accountKeys.address,
    // ofetch returns undefined for an empty body; the API sends `null`.
    queryFn: async () => (await fetchAddress()) ?? null,
  });
}
