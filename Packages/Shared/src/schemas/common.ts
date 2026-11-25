import { z } from 'zod';

/** User role (users.role CHECK in Apps/Api_Php/database/Schema.sql). */
export const Role = z.enum(['admin', 'customer']);
export type Role = z.infer<typeof Role>;

/** Account status: 'pending' until the e-mail is confirmed. */
export const UserStatus = z.enum(['pending', 'active']);
export type UserStatus = z.infer<typeof UserStatus>;

/** Error body of every non-validation API error: { error: 'CODE', meta?: {...} }. */
export const ApiErrorBody = z.object({
  error: z.string(),
  meta: z.record(z.unknown()).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/** Money is always an integer number of grosze (1 zł = 100); formatting happens only in the web. */
export type Money = number;
export const Money = z.number().int();
