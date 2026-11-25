import type { VariantKey } from '@catalog/shared/schemas/product';

// Display labels shared by the cart and the order pages.

export const VARIANT_LABELS: Record<VariantKey, string> = {
  oryginalne: 'Oryginalne',
  zamienne: 'Zamienne',
};

export function variantLabel(variant: VariantKey | null): string | null {
  return variant ? VARIANT_LABELS[variant] : null;
}

export const PRICE_ON_REQUEST = 'Cena na zapytanie';
