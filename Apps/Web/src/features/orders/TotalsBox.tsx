import type { MoneyTotals } from '@catalog/shared/schemas/cart';
import { Text } from '@mantine/core';

import { formatPercent, formatPLN } from '@/lib/format';

import classes from './Orders.module.css';

interface TotalsBoxProps {
  totals: MoneyTotals;
  discountPercent: number;
  /** Per-product rabaty: lines carry their own %, so no single % is quoted. */
  productDiscounts?: boolean;
  hasPriceOnRequest: boolean;
  /** Label of the last row ("Razem z kaucją"). */
  finalLabel?: string;
}

// Razem netto / brutto, Kaucja (VAT 0%), total with kaucja. Ink, never red.
export function TotalsBox({
  totals,
  discountPercent,
  productDiscounts = false,
  hasPriceOnRequest,
  finalLabel = 'Razem z kaucją',
}: TotalsBoxProps) {
  return (
    <div className={classes.totals}>
      <dl className={classes.totalsList}>
        <div>
          <dt>Razem netto</dt>
          <dd>{formatPLN(totals.net)}</dd>
        </div>
        <div>
          <dt>Razem brutto</dt>
          <dd>{formatPLN(totals.gross)}</dd>
        </div>
        <div>
          <dt>Kaucja (VAT 0%)</dt>
          <dd>{formatPLN(totals.deposit)}</dd>
        </div>
        <div className={classes.totalsFinal}>
          <dt>{finalLabel}</dt>
          <dd>{formatPLN(totals.grossWithDeposit)}</dd>
        </div>
      </dl>
      {productDiscounts ? (
        <Text size='xs' c='cdmInk.6' mt='xs'>
          Ceny uwzględniają Twoje rabaty produktowe (rabat przy każdej pozycji).
          Rabat nie obejmuje kaucji.
        </Text>
      ) : discountPercent > 0 ? (
        <Text size='xs' c='cdmInk.6' mt='xs'>
          Ceny uwzględniają rabat {formatPercent(discountPercent)}. Rabat nie
          obejmuje kaucji.
        </Text>
      ) : null}
      {hasPriceOnRequest ? (
        <Text size='xs' c='cdmInk.6' mt='xs'>
          Pozycje z ceną na zapytanie nie są wliczone do sumy. Ich cenę
          potwierdzi DEMO PARTS.
        </Text>
      ) : null}
    </div>
  );
}
