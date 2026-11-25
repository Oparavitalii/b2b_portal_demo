import {
  type ApiKey,
  apiKeyListSchema,
  type CreateApiKeyInput,
  type CreatedApiKey,
  createdApiKeySchema,
  revokedApiKeySchema,
} from '@catalog/shared/schemas/apiKeys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/http';

// Client API keys (B-21). One set of hooks for both owners of the list:
// the customer (/me/api-keys) and the admin acting for a customer
// (/admin/customers/:id/api-keys).

/** null = the signed-in customer; a UUID = that customer, managed by the admin. */
export type ApiKeysOwner = string | null;

function basePath(owner: ApiKeysOwner): string {
  return owner === null ? '/me/api-keys' : `/admin/customers/${owner}/api-keys`;
}

export const apiKeysKeys = {
  list: (owner: ApiKeysOwner) => ['api-keys', owner ?? 'me'] as const,
  categories: ['api-keys', 'categories'] as const,
};

export function useApiKeys(owner: ApiKeysOwner) {
  return useQuery<ApiKey[]>({
    queryKey: apiKeysKeys.list(owner),
    queryFn: async ({ signal }) =>
      apiKeyListSchema.parse(
        await apiFetch<unknown>(basePath(owner), { signal }),
      ).items,
  });
}

export function useCreateApiKey(owner: ApiKeysOwner) {
  const qc = useQueryClient();
  return useMutation<CreatedApiKey, unknown, CreateApiKeyInput>({
    mutationFn: async (input) =>
      createdApiKeySchema.parse(
        await apiFetch<unknown>(basePath(owner), {
          method: 'POST',
          body: input,
        }),
      ),
    meta: { errorHandled: true },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: apiKeysKeys.list(owner) }),
  });
}

export function useRevokeApiKey(owner: ApiKeysOwner) {
  const qc = useQueryClient();
  return useMutation<ApiKey, unknown, string>({
    mutationFn: async (id) =>
      revokedApiKeySchema.parse(
        await apiFetch<unknown>(`${basePath(owner)}/${id}`, {
          method: 'DELETE',
        }),
      ).apiKey,
    meta: { errorHandled: true },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: apiKeysKeys.list(owner) }),
  });
}

/** Catalogue categories for the scope picker (facets of GET /products). */
export function useCatalogCategories() {
  return useQuery<string[]>({
    queryKey: apiKeysKeys.categories,
    queryFn: async ({ signal }) => {
      const res = await apiFetch<{
        facets?: { categories?: { value: string }[] };
      }>('/products', { query: { pageSize: 1 }, signal });
      return (res.facets?.categories ?? []).map((c) => c.value);
    },
    staleTime: 5 * 60_000,
  });
}
