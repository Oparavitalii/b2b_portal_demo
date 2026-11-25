import type { ProductDetail, VariantKey } from '@catalog/shared/schemas/product';
import {
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ShoppingCart } from 'lucide-react';
import { useId, useState } from 'react';

import { apiErrorMessage } from '@/lib/http';

import { useAddToCart } from './api';
import classes from './Catalog.module.css';
import { PriceBlock } from './PriceBlock';
import { StockInfo } from './StockInfo';

const VARIANT_LABELS: Record<VariantKey, string> = {
  oryginalne: 'Oryginalne',
  zamienne: 'Zamienne',
};

const MAX_QTY = 999;

function clampQty(value: string | number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_QTY, n);
}

// Price block (net / gross / deposit), variant choice and "Dodaj do koszyka".
export function BuyBox({ product }: { product: ProductDetail }) {
  const labelId = useId();
  const [variant, setVariant] = useState<VariantKey | null>(
    product.variants[0]?.key ?? null,
  );
  const [qty, setQty] = useState<number>(1);
  const addToCart = useAddToCart();

  const chosen = product.variants.find((v) => v.key === variant);
  const price = product.hasVariants ? (chosen?.price ?? null) : product.price;
  const deposit = product.price?.unitDeposit ?? 0;

  const submit = () => {
    addToCart.mutate(
      { sku: product.sku, variant: product.hasVariants ? variant : null, qty },
      {
        onSuccess: () =>
          notifications.show({
            color: 'green',
            title: 'Dodano do koszyka',
            message: `${product.name} × ${qty}`,
          }),
        onError: (err) =>
          notifications.show({
            color: 'red',
            title: 'Nie dodano do koszyka',
            message: apiErrorMessage(err),
            autoClose: 8000,
          }),
      },
    );
  };

  return (
    <div className={classes.buyBox}>
      {product.hasVariants ? (
        <div style={{ marginBottom: 'var(--cdm-space-md)' }}>
          <Text size='sm' fw={600} mb={6} id={labelId}>
            Wersja
          </Text>
          <SegmentedControl
            aria-labelledby={labelId}
            fullWidth
            value={variant ?? undefined}
            onChange={(value) => setVariant(value as VariantKey)}
            data={product.variants.map((v) => ({
              value: v.key,
              label: VARIANT_LABELS[v.key],
            }))}
          />
        </div>
      ) : null}

      <PriceBlock
        price={price}
        deposit={deposit}
        discountPercent={product.discountPercent}
        large
      />
      {deposit > 0 ? (
        <Text size='xs' c='cdmInk.5' mt={4}>
          Kaucja bez rabatu, VAT 0%.
        </Text>
      ) : null}
      <StockInfo
        stock={product.stock}
        qty={qty}
        leadTimeHours={product.leadTimeHours}
      />

      <Group mt='md' align='flex-end' wrap='wrap'>
        <NumberInput
          label='Ilość'
          value={qty}
          onChange={(v) => setQty(clampQty(v))}
          min={1}
          max={MAX_QTY}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior='strict'
          w={110}
        />
        <Button
          leftSection={<ShoppingCart size={18} aria-hidden />}
          onClick={submit}
          loading={addToCart.isPending}
          disabled={product.hasVariants && variant === null}
          style={{ flex: '1 1 200px' }}
        >
          Dodaj do koszyka
        </Button>
      </Group>
    </div>
  );
}
