import type { Me } from '@catalog/shared/schemas/account';
import type {
  LoginPayload,
  RegisterPayload,
  RegisterResult,
  ResetConfirmPayload,
  ResetRequestPayload,
} from '@catalog/shared/schemas/auth';

import { apiFetch } from '@/lib/http';

// /api/auth/* calls used by the public auth pages (R-03, R-18, R-24).

export interface LoginResponse {
  user: Me;
  accessToken: string;
}

export function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: payload,
  });
}

export function register(payload: RegisterPayload): Promise<RegisterResult> {
  return apiFetch<RegisterResult>('/auth/register', {
    method: 'POST',
    body: payload,
  });
}

export function verifyEmail(token: string): Promise<RegisterResult> {
  return apiFetch<RegisterResult>('/auth/verify-email', {
    method: 'POST',
    body: { token },
  });
}

export function resendVerification(email: string): Promise<void> {
  return apiFetch<void>('/auth/resend-verification', {
    method: 'POST',
    body: { email },
  });
}

export function requestPasswordReset(
  payload: ResetRequestPayload,
): Promise<void> {
  return apiFetch<void>('/auth/password-reset/request', {
    method: 'POST',
    body: payload,
  });
}

export function confirmPasswordReset(
  payload: ResetConfirmPayload,
): Promise<void> {
  return apiFetch<void>('/auth/password-reset/confirm', {
    method: 'POST',
    body: payload,
  });
}
