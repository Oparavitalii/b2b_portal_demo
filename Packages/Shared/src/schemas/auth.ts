import { z } from 'zod';

// Auth payloads — same rules as Apps/Api_Php (Services/Register_Service.php,
// Services/Auth_Service.php). Messages are Polish: the web shows them as-is.

export const emailSchema = z
  .string({ required_error: 'Podaj adres e-mail' })
  .trim()
  .toLowerCase()
  .min(1, 'Podaj adres e-mail')
  .max(254, 'Adres e-mail jest za długi')
  .email('Podaj poprawny adres e-mail');

/** New password: at least 8 characters (API min 8, max 200, not trimmed). */
export const newPasswordSchema = z
  .string({ required_error: 'Podaj hasło' })
  .min(8, 'Hasło musi mieć co najmniej 8 znaków')
  .max(200, 'Hasło może mieć najwyżej 200 znaków');

/** NIP: 10 digits; dashes and spaces typed by the user are stripped first. */
export const nipSchema = z
  .string({ required_error: 'Podaj NIP' })
  .transform((value) => value.replace(/[\s-]+/g, ''))
  .pipe(z.string().regex(/^\d{10}$/, 'NIP musi mieć 10 cyfr'));

export const phoneSchema = z
  .string({ required_error: 'Podaj numer telefonu' })
  .trim()
  .min(6, 'Podaj numer telefonu (co najmniej 6 znaków)')
  .max(40, 'Numer telefonu jest za długi')
  .regex(
    /^\+?[0-9][0-9 ()-]{5,39}$/,
    'Numer telefonu może zawierać cyfry, spacje, „+”, „-” i nawiasy',
  );

export const companyNameSchema = z
  .string({ required_error: 'Podaj nazwę firmy' })
  .trim()
  .min(2, 'Podaj nazwę firmy')
  .max(200, 'Nazwa firmy jest za długa');

export const contactNameSchema = z
  .string({ required_error: 'Podaj imię i nazwisko' })
  .trim()
  .min(2, 'Podaj imię i nazwisko')
  .max(200, 'Imię i nazwisko jest za długie');

/**
 * POST /api/auth/register (R-03): login + password only (owner, 2026-10-08).
 * Company data is filled later in "Moje konto" (updateMeSchema) and is
 * required before the first order (API: 422 company_data_required).
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({
      message: 'Zaakceptuj Regulamin i Politykę prywatności',
    }),
  }),
});
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterPayload = z.output<typeof registerSchema>;

/** 201 body of POST /api/auth/register and 200 body of /auth/verify-email. */
export const registerResultSchema = z.object({
  email: z.string(),
  status: z.enum(['pending', 'active']),
});
export type RegisterResult = z.infer<typeof registerResultSchema>;

/** POST /api/auth/login. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: 'Podaj hasło' })
    .min(1, 'Podaj hasło')
    .max(200, 'Hasło może mieć najwyżej 200 znaków'),
});
export type LoginInput = z.input<typeof loginSchema>;
export type LoginPayload = z.output<typeof loginSchema>;

const tokenSchema = z
  .string({ required_error: 'Brak tokenu w linku' })
  .min(20, 'Link jest niepełny')
  .max(200, 'Link jest nieprawidłowy');

/** POST /api/auth/verify-email (R-18). */
export const verifyEmailSchema = z.object({ token: tokenSchema });
export type VerifyEmailPayload = z.infer<typeof verifyEmailSchema>;

/** POST /api/auth/resend-verification (R-18). */
export const resendVerificationSchema = z.object({ email: emailSchema });
export type ResendVerificationPayload = z.output<
  typeof resendVerificationSchema
>;

/** POST /api/auth/password-reset/request (R-24). */
export const resetRequestSchema = z.object({ email: emailSchema });
export type ResetRequestInput = z.input<typeof resetRequestSchema>;
export type ResetRequestPayload = z.output<typeof resetRequestSchema>;

/** POST /api/auth/password-reset/confirm (R-24). */
export const resetConfirmSchema = z.object({
  token: tokenSchema,
  password: newPasswordSchema,
});
export type ResetConfirmPayload = z.infer<typeof resetConfirmSchema>;
