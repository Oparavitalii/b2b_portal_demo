import { CART_MAX_QTY, type CartLine } from '@catalog/shared/schemas/cart';
import { ActionIcon, NumberInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { ImageOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { StockInfo } from '@/features/catalog/StockInfo';
import { PRICE_ON_REQUEST, variantLabel } from '@/features/orders/labels';
import { formatPercent, formatPLN } from '@/lib/format';

import { useSetCartItem } from './api';
import classes from './Cart.module.css';

const QTY_DEBOUNCE_MS = 500;

function clampQty(value: string | number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(CART_MAX_QTY, n);
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={classes.thumb}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading='lazy'
          decoding='async'
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageOff size={24} strokeWidth={1.5} aria-label='Brak zdjęcia' />
      )}
    </div>
  );
}

// One cart line: photo, name, variant, quantity (PUT after a short pause),
// remove, unit + line prices net / gross and kaucja.
export function CartLineRow({
  line,
  showDiscount = false,
}: {
  line: CartLine;
  /** Per-product rabaty: show this line's %. */
  showDiscount?: boolean;
}) {
  const setItem = useSetCartItem();
  const { mutate } = setItem;
  const [qty, setQty] = useState(line.qty);
  const [debouncedQty] = useDebouncedValue(qty, QTY_DEBOUNCE_MS);
  const variant = variantLabel(line.variant);

  useEffect(() => {
    if (debouncedQty !== line.qty) {
      mutate({ sku: line.sku, variant: line.variant, qty: debouncedQty });
    }
    // Only a new debounced value sends a request; server echoes do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQty]);

  const remove = () => mutate({ sku: line.sku, variant: line.variant, qty: 0 });

  return (
    <li className={classes.line}>
      <Thumb src={line.imageUrl} alt={line.name} />
      <div className={classes.info}>
        <Link
          to={`/produkt/${encodeURIComponent(line.sku)}`}
          className={classes.name}
        >
          {line.name}
        </Link>
        <div className={classes.meta}>
          SKU: {line.sku}
          {variant ? ` · Wersja: ${variant}` : ''}
          {showDiscount && line.discountPercent > 0
            ? ` · Rabat ${formatPercent(line.discountPercent)}`
            : ''}
        </div>
        <StockInfo
          stock={line.stock}
          qty={qty}
          leadTimeHours={line.leadTimeHours}
        />

        <div className={classes.controls}>
          <NumberInput
            label='Ilość'
            size='xs'
            w={96}
            value={qty}
            onChange={(v) => setQty(clampQty(v))}
            min={1}
            max={CART_MAX_QTY}
            allowDecimal={false}
            allowNegative={false}
            clampBehavior='strict'
            disabled={setItem.isPending && setItem.variables?.qty === 0}
          />

          {line.priceOnRequest ? (
            <dl className={classes.prices}>
              <div>
                <dt>Cena</dt>
                <dd className={classes.onRequest}>{PRICE_ON_REQUEST}</dd>
              </div>
              <div>
                <dt>Kaucja / szt.</dt>
                <dd>{formatPLN(line.unitDeposit)}</dd>
              </div>
            </dl>
          ) : (
            <dl className={classes.prices}>
              <div>
                <dt>Cena netto</dt>
                <dd>{formatPLN(line.unitNet ?? 0)}</dd>
              </div>
              <div>
                <dt>Cena brutto</dt>
                <dd>{formatPLN(line.unitGross ?? 0)}</dd>
              </div>
              <div>
                <dt>Kaucja / szt.</dt>
                <dd>{formatPLN(line.unitDeposit)}</dd>
              </div>
              <div>
                <dt>Wartość netto</dt>
                <dd>{formatPLN(line.lineNet ?? 0)}</dd>
              </div>
              <div>
                <dt>Wartość brutto</dt>
                <dd className={classes.lineTotal}>
                  {formatPLN(line.lineGross ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Kaucja razem</dt>
                <dd>{formatPLN(line.lineDeposit)}</dd>
              </div>
            </dl>
          )}

          <Tooltip label='Usuń z koszyka'>
            <ActionIcon
              variant='subtle'
              color='cdmInk.9'
              size='lg'
              aria-label={`Usuń z koszyka: ${line.name}`}
              onClick={remove}
              loading={setItem.isPending && setItem.variables?.qty === 0}
            >
              <Trash2 size={18} aria-hidden />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}
