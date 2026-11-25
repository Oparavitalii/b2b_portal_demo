import { z } from 'zod';

// Client API keys (B-21) — mirror of Apps/Api_Php/src/Services/Api_Keys_Service.php.
// The plain key exists only in the create response.

export const API_KEYS_MAX_ACTIVE = 5;

export const apiKeyScopeSchema = z.enum(['all', 'list']);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** 'cdm_live_a1b2' — enough to recognise the key, useless to call the API. */
  prefix: z.string(),
  scope: apiKeyScopeSchema,
  skus: z.array(z.string()),
  categories: z.array(z.string()),
  createdBy: z.enum(['customer', 'admin']),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  requestCount: z.number().int(),
  revokedAt: z.string().nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

export const apiKeyListSchema = z.object({ items: z.array(apiKeySchema) });

export const createdApiKeySchema = z.object({
  key: z.string(),
  apiKey: apiKeySchema,
});
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;

export const revokedApiKeySchema = z.object({ apiKey: apiKeySchema });

export const createApiKeySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Podaj nazwę klucza')
      .max(60, 'Nazwa może mieć najwyżej 60 znaków'),
    scope: apiKeyScopeSchema,
    skus: z.array(z.string().trim().min(1).max(100)).max(2000),
    categories: z.array(z.string().trim().min(1).max(100)).max(100),
  })
  .refine(
    (v) => v.scope === 'all' || v.skus.length > 0 || v.categories.length > 0,
    { path: ['skus'], message: 'Wybierz co najmniej jeden SKU lub kategorię' },
  );
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
