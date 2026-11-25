import type { ZodTypeAny } from 'zod';

import { apiErrorMessage, parseApiError } from '@/lib/http';

export type FieldErrors = Record<string, string>;

// Mantine form `validate` from a shared zod schema (schema.safeParse, no
// resolver package): first message per field path, Polish from the schema.
export function zodErrors(schema: ZodTypeAny, values: unknown): FieldErrors {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (key !== '' && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

// Field errors from an API 400 validation body
// ({ success: false, error: { issues: [{ path, ... }] } }), or null.
export function serverFieldErrors(err: unknown): FieldErrors | null {
  if (!err || typeof err !== 'object' || !('response' in err)) return null;
  const data = (err as { response?: { _data?: unknown } }).response?._data;
  if (!data || typeof data !== 'object') return null;
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return null;
  const errors: FieldErrors = {};
  for (const issue of issues as unknown[]) {
    const path =
      issue && typeof issue === 'object'
        ? (issue as { path?: unknown }).path
        : undefined;
    if (!Array.isArray(path)) continue;
    const key = path.join('.');
    if (key !== '' && !(key in errors)) {
      errors[key] = 'Nieprawidłowa wartość.';
    }
  }
  return errors;
}

const CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Nieprawidłowy adres e-mail lub hasło.',
  email_not_verified: 'Adres e-mail nie został jeszcze potwierdzony.',
  account_blocked:
    'Konto zostało zablokowane. Skontaktuj się z DEMO PARTS, aby je odblokować.',
  email_taken: 'Konto z tym adresem e-mail już istnieje.',
  invalid_token: 'Link jest nieprawidłowy, wygasł albo został już użyty.',
  wrong_password: 'Podane hasło jest nieprawidłowe.',
  TOO_MANY_REQUESTS: 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.',
};

// Polish message for an auth/account API error.
export function accountErrorMessage(err: unknown): string {
  const info = parseApiError(err);
  const known = info.code ? CODE_MESSAGES[info.code] : undefined;
  if (known) return known;
  if (serverFieldErrors(err)) return 'Popraw zaznaczone pola formularza.';
  return apiErrorMessage(err);
}
