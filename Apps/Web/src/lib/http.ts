import { type FetchOptions, ofetch, type ResponseType } from 'ofetch';

import { clearAuth, getAccessToken, setAccessTokenSync } from './auth-store';

// Same origin: the API is mounted at /api (Vite proxy in dev, Apache in prod).
export const API_BASE_URL = '/api';

// ---------------------------------------------------------------------------
// Token refresh.
// 'unauthorized' — the server said the session is dead (401/403): clear auth.
// 'failed' — transport failure (API unreachable, 5xx): retried, auth kept.
// The attempt runs under a Web Lock shared by all tabs of this origin, so
// tabs restored together do not race on the rotating refresh cookie.
// ---------------------------------------------------------------------------
type RefreshOutcome = 'ok' | 'unauthorized' | 'failed';

const REFRESH_LOCK_NAME = 'catalog:auth-refresh';
const REFRESH_RETRY_DELAYS_MS = [1000, 2000];
const REFRESH_TIMEOUT_MS = 10_000;

function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (!response || typeof response !== 'object' || !('status' in response))
    return undefined;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

async function refreshOnce(): Promise<RefreshOutcome> {
  try {
    const res = await ofetch<{ accessToken: string }>('/auth/refresh', {
      baseURL: API_BASE_URL,
      method: 'POST',
      credentials: 'include',
      timeout: REFRESH_TIMEOUT_MS,
    });
    setAccessTokenSync(res.accessToken);
    return 'ok';
  } catch (err) {
    const status = extractStatus(err);
    if (status === 401 || status === 403) return 'unauthorized';
    return 'failed';
  }
}

async function refreshWithRetry(): Promise<RefreshOutcome> {
  let outcome = await refreshOnce();
  for (const delayMs of REFRESH_RETRY_DELAYS_MS) {
    if (outcome !== 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    outcome = await refreshOnce();
  }
  return outcome;
}

export async function performTokenRefresh(): Promise<RefreshOutcome> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const outcome = locks
    ? await locks.request(REFRESH_LOCK_NAME, () => refreshWithRetry())
    : await refreshWithRetry();
  if (outcome === 'unauthorized') clearAuth();
  return outcome;
}

// Single-flight: concurrent 401s in one tab share one refresh.
let refreshInFlight: Promise<boolean> | null = null;

function attemptRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      return (await performTokenRefresh()) === 'ok';
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

// Base instance — Bearer token + refresh cookie on every request.
export const http = ofetch.create({
  baseURL: API_BASE_URL,
  credentials: 'include',
  retry: 0,
  onRequest({ options }) {
    const token = getAccessToken();
    if (token) {
      const headers = new Headers(options.headers as HeadersInit | undefined);
      headers.set('Authorization', `Bearer ${token}`);
      options.headers = headers;
    }
  },
});

export type ApiFetchOptions = FetchOptions<ResponseType> & { _retry?: boolean };

/**
 * apiFetch — `path` is relative to /api (e.g. '/me', '/cart').
 * A 401 triggers one single-flight refresh and one retry with the new token.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { _retry, ...fetchOptions } = options;
  try {
    // responseType decides the body type (json by default, blob for file downloads).
    return (await http<T, ResponseType>(path, fetchOptions)) as T;
  } catch (err: unknown) {
    const status = extractStatus(err);
    const isAuthEndpoint =
      path.includes('/auth/refresh') || path.includes('/auth/login');
    if (status === 401 && !_retry && !isAuthEndpoint) {
      const refreshed = await attemptRefresh();
      if (!refreshed) throw err;
      return apiFetch<T>(path, { ...fetchOptions, _retry: true });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Errors — the API answers { error: string, meta?: object } (ApiError).
// ---------------------------------------------------------------------------
export interface ApiErrorInfo {
  status?: number;
  code?: string;
  meta?: Record<string, unknown>;
}

export function parseApiError(err: unknown): ApiErrorInfo {
  const status = extractStatus(err);
  if (!err || typeof err !== 'object' || !('response' in err))
    return { status };
  const response = (err as { response?: { _data?: unknown } }).response;
  const data = response?._data;
  if (!data || typeof data !== 'object') return { status };
  const { error, meta } = data as { error?: unknown; meta?: unknown };
  return {
    status,
    code: typeof error === 'string' ? error : undefined,
    meta:
      meta && typeof meta === 'object'
        ? (meta as Record<string, unknown>)
        : undefined,
  };
}

// True when no HTTP response arrived at all (offline, DNS, dropped connection).
export function isNetworkError(info: ApiErrorInfo): boolean {
  return info.status === undefined;
}

// Polish fallback message for an API error (used by the global mutation toast).
export function apiErrorMessage(err: unknown): string {
  const info = parseApiError(err);
  if (isNetworkError(info)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Brak połączenia z internetem.'
      : 'Nie udało się połączyć z serwerem. Spróbuj ponownie.';
  }
  if (info.status === 401) return 'Sesja wygasła. Zaloguj się ponownie.';
  if (info.status === 403) return 'Brak uprawnień do tej operacji.';
  if (info.status === 404) return 'Nie znaleziono zasobu.';
  if (info.status === 429)
    return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
  const detail = info.code ?? (info.status ? `HTTP ${info.status}` : '');
  return detail ? `Wystąpił błąd (${detail}).` : 'Wystąpił błąd.';
}
