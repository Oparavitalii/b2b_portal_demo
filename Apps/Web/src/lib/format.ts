// Display formatting — money is integer grosze everywhere in the API and DB;
// it is turned into złoty only here, in the web.

const plnFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const percentFormatter = new Intl.NumberFormat('pl-PL', {
  maximumFractionDigits: 2,
});

/** 123456 grosze -> '1234,56 zł' (pl-PL grouping). */
export function formatPLN(grosze: number): string {
  return plnFormatter.format(grosze / 100);
}

/** Nullable money: null means "Cena na zapytanie". */
export function formatPLNOrRequest(grosze: number | null | undefined): string {
  return grosze === null || grosze === undefined
    ? 'Cena na zapytanie'
    : formatPLN(grosze);
}

function toDate(value: string | Date): Date | null {
  const d =
    value instanceof Date
      ? value
      : new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO / SQLite datetime -> 'dd.mm.rrrr'. */
export function formatDate(value: string | Date): string {
  const d = toDate(value);
  return d ? dateFormatter.format(d) : '';
}

/** ISO / SQLite datetime -> 'dd.mm.rrrr, gg:mm'. */
export function formatDateTime(value: string | Date): string {
  const d = toDate(value);
  return d ? dateTimeFormatter.format(d) : '';
}

/** 12.5 -> '12,5%'. */
export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

/** '0000000000' -> '894-329-15-93'; anything else is returned unchanged. */
export function formatNip(nip: string): string {
  const digits = nip.replace(/\D/g, '');
  if (digits.length !== 10) return nip;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}
