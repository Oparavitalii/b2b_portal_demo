import { z } from 'zod';

// Stock and delivery time shown in the catalogue, the product page and the cart.
// Stock is set in the admin panel (products.stock, default by category) and is display only:
// an order never lowers it. Delivery time: the admin's 24 / 48 / 72 h when set,
// otherwise automatic — all pieces in stock → 24 h, otherwise production → 72 h.
// Ordering more than the stock (some pieces in stock) is production: at least 72 h,
// whatever the admin set.

export const LEAD_TIME_IN_STOCK_H = 24;
export const LEAD_TIME_PRODUCTION_H = 72;
export const LEAD_TIMES = [24, 48, 72] as const;
export const leadTimeHoursSchema = z.union([
  z.literal(24),
  z.literal(48),
  z.literal(72),
]);
export type LeadTimeHours = z.infer<typeof leadTimeHoursSchema>;

/** Categories regenerated to order (owner, 2026-10-12). Same list: ProductsService::TO_ORDER_CATEGORIES. */
export const TO_ORDER_CATEGORIES: readonly string[] = [
  'Pompy CR',
  'Zbiorniki AdBlue',
];

/**
 * Stock and delivery time a new product starts with: pumps and AdBlue tanks
 * 1 piece / 72 h, everything else 4 pieces / automatic (in stock → 24 h).
 */
export function stockDefaults(category: string | null): {
  stock: number;
  leadTimeHours: LeadTimeHours | null;
} {
  return category !== null && TO_ORDER_CATEGORIES.includes(category.trim())
    ? { stock: 1, leadTimeHours: 72 }
    : { stock: 4, leadTimeHours: null };
}

export interface Availability {
  /** All `qty` pieces can ship from stock. */
  inStock: boolean;
  /** "W magazynie: 10 szt." | "W produkcji" */
  label: string;
  /** 24, 48 or 72 */
  leadTimeHours: number;
  /** "Wysyłka w 24 h" */
  leadTimeText: string;
}

/** `leadTimeHours` = the admin's setting (null/undefined = automatic from stock). */
export function availability(
  stock: number | null,
  qty = 1,
  leadTimeHours: number | null = null,
): Availability {
  const pieces = stock !== null && stock > 0 ? stock : 0;
  const inStock = pieces > 0 && qty <= pieces;
  const auto = inStock ? LEAD_TIME_IN_STOCK_H : LEAD_TIME_PRODUCTION_H;
  const partial = pieces > 0 && qty > pieces;
  const hours =
    leadTimeHours === null
      ? auto
      : partial
        ? Math.max(leadTimeHours, LEAD_TIME_PRODUCTION_H)
        : leadTimeHours;
  return {
    inStock,
    label: pieces > 0 ? `W magazynie: ${pieces} szt.` : 'W produkcji',
    leadTimeHours: hours,
    leadTimeText: `Wysyłka w ${hours} h`,
  };
}
