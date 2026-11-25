// Display helpers only — prices are computed by the API (Pricing_Service).
// Money is integer grosze; these turn it into Polish złoty strings.

const plnFormatter = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/**
 * 123456 grosze -> '1 234,56 zł'. pl-PL leaves 4-digit numbers ungrouped by
 * default, so the grouping is applied explicitly for every value >= 1000.
 */
export function formatPLN(grosze: number): string {
  const sign = grosze < 0 ? '-' : '';
  const parts = plnFormatter.formatToParts(Math.abs(grosze) / 100);
  const integer = parts
    .filter((p) => p.type === 'integer')
    .map((p) => p.value)
    .join('');
  const fraction = parts.find((p) => p.type === 'fraction')?.value ?? '00';
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? ',';
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${sign}${grouped}${decimal}${fraction}\u00a0zł`;
}

/** { unitNet, unitGross } -> { net: '1 234,56 zł netto', gross: '1 518,51 zł brutto' }. */
export function formatNetGross(price: { unitNet: number; unitGross: number }): {
  net: string;
  gross: string;
} {
  return {
    net: `${formatPLN(price.unitNet)} netto`,
    gross: `${formatPLN(price.unitGross)} brutto`,
  };
}
