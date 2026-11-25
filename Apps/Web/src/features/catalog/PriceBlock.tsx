import { formatPLN } from '@catalog/shared/schemas/product';
import { VisuallyHidden } from '@mantine/core';

import classes from './Catalog.module.css';
import { DiscountBadge } from './DiscountBadge';

interface PriceBlockProps {
  /** null = price on request. listNet is the price before the discount, sent only with one. */
  price: { unitNet: number; unitGross: number; listNet?: number } | null;
  /** Kaucja per unit (grosze, 0% VAT, never discounted). */
  deposit: number;
  /** The customer's discount; with listNet the old price is shown struck out next to it. */
  discountPercent?: number;
  large?: boolean;
}

// Net price big ('netto'), gross small ('brutto'), deposit small. With a discount
// the price before it sits above, struck out, with 'Rabat -X%'. Never red:
// the one red element on a screen is the call to action.
export function PriceBlock({
  price,
  deposit,
  discountPercent = 0,
  large = false,
}: PriceBlockProps) {
  if (price === null) {
    return (
      <div>
        <div className={classes.onRequest}>Cena na zapytanie</div>
        {deposit > 0 ? (
          <div className={classes.small}>Kaucja: {formatPLN(deposit)}</div>
        ) : null}
      </div>
    );
  }
  const listNet =
    discountPercent > 0 &&
    price.listNet !== undefined &&
    price.listNet > price.unitNet
      ? price.listNet
      : null;
  return (
    <div>
      {listNet !== null ? (
        <div className={classes.listRow}>
          <s className={classes.listPrice}>
            <VisuallyHidden>Cena przed rabatem: </VisuallyHidden>
            {formatPLN(listNet)}
          </s>
          <DiscountBadge percent={discountPercent} size='sm' />
        </div>
      ) : null}
      <div
        className={large ? `${classes.net} ${classes.netLarge}` : classes.net}
      >
        {listNet !== null ? (
          <VisuallyHidden>Twoja cena: </VisuallyHidden>
        ) : null}
        {formatPLN(price.unitNet)}
        <span className={classes.unit}>netto</span>
      </div>
      <div className={classes.small}>{formatPLN(price.unitGross)} brutto</div>
      {deposit > 0 ? (
        <div className={classes.small}>Kaucja: {formatPLN(deposit)}</div>
      ) : null}
    </div>
  );
}
