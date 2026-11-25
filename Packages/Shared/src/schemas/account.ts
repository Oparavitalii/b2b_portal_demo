import { z } from 'zod';

import {
  companyNameSchema,
  contactNameSchema,
  newPasswordSchema,
  nipSchema,
  phoneSchema,
} from './auth';
import { Role } from './common';

// "Moje konto" payloads — same rules as Apps/Api_Php/src/Services/Account_Service.php.

/** GET /api/me and the `user` of POST /api/auth/login (Core/Auth::publicUser). */
export const meSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: Role,
  companyName: z.string().nullable(),
  nip: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  discountPercent: z.number().min(0).max(100),
});
export type Me = z.infer<typeof meSchema>;

/** PATCH /api/me (R-07) — every field optional; role and discount are never accepted. */
export const updateMeSchema = z.object({
  companyName: companyNameSchema.optional(),
  nip: nipSchema.optional(),
  contactName: contactNameSchema.optional(),
  phone: phoneSchema.optional(),
});
export type UpdateMeInput = z.input<typeof updateMeSchema>;
export type UpdateMePayload = z.output<typeof updateMeSchema>;

/** POST /api/me/password (R-08). */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: 'Podaj obecne hasło' })
    .min(1, 'Podaj obecne hasło')
    .max(200, 'Hasło może mieć najwyżej 200 znaków'),
  newPassword: newPasswordSchema,
});
export type ChangePasswordPayload = z.infer<typeof changePasswordSchema>;

/** PUT /api/me/address (R-04, R-09) — the one delivery address of a customer. */
export const addressSchema = z.object({
  companyName: companyNameSchema,
  street: z
    .string({ required_error: 'Podaj ulicę i numer' })
    .trim()
    .min(2, 'Podaj ulicę i numer')
    .max(200, 'Adres jest za długi'),
  postalCode: z
    .string({ required_error: 'Podaj kod pocztowy' })
    .trim()
    .regex(/^\d{2}-\d{3}$/, 'Kod pocztowy w formacie 00-000'),
  city: z
    .string({ required_error: 'Podaj miejscowość' })
    .trim()
    .min(2, 'Podaj miejscowość')
    .max(100, 'Nazwa miejscowości jest za długa'),
  country: z
    .string()
    .trim()
    .min(2, 'Podaj kraj')
    .max(100, 'Nazwa kraju jest za długa')
    .default('Polska'),
  phone: z
    .union([z.literal(''), phoneSchema])
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});
export type AddressInput = z.input<typeof addressSchema>;
export type AddressPayload = z.output<typeof addressSchema>;

/** Body of GET /api/me/address (null when no address is saved) and PUT /api/me/address. */
export const addressResponseSchema = z.object({
  companyName: z.string(),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  phone: z.string().nullable(),
  updatedAt: z.string(),
});
export type Address = z.infer<typeof addressResponseSchema>;

/** DELETE /api/me (R-12) — password confirmation. */
export const deleteAccountSchema = z.object({
  password: z
    .string({ required_error: 'Podaj hasło' })
    .min(1, 'Podaj hasło, aby potwierdzić')
    .max(200, 'Hasło może mieć najwyżej 200 znaków'),
});
export type DeleteAccountPayload = z.infer<typeof deleteAccountSchema>;
