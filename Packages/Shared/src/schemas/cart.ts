import { z } from 'zod';

import { leadTimeHoursSchema } from '../availability';
import { variantKeySchema } from './product';

// Koszyk (R-05) — mirror of Apps/Api_Php/src/Services/Cart_Service.php.
// Money is integer grosze. A "Cena na zapytanie" line has null prices and is
// left out of the totals (its kaucja too).

const grosze = z.number().int();

export const CART_MAX_QTY = 999;

export const cartLineSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  /** File name of the product photo (null = no photo). */
  image: z.string().nullable(),
  /** Public URL of the photo, '/img/products/<file>'. */
  imageUrl: z.string().nullable(),
  variant: variantKeySchema.nullable(),
  qty: z.number().int().min(1).max(CART_MAX_QTY),
  /** % this line is priced with (per-product rabat, else the global %). */
  discountPercent: z.number().min(0).max(100),
  priceOnRequest: z.boolean(),
  unitNet: grosze.nullable(),
  unitGross: grosze.nullable(),
  /** Kaucja per unit: never discounted, VAT 0%. */
  unitDeposit: grosze,
  lineNet: grosze.nullable(),
  lineGross: grosze.nullable(),
  lineDeposit: grosze,
  /** Pieces in stock, set in the admin panel (4 by default). Display only: orders never lower it. */
  stock: z.number().int().nonnegative(),
  /** Delivery time the admin set, or null = automatic (24 h from stock, 72 h production). */
  leadTimeHours: leadTimeHoursSchema.nullable(),
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const moneyTotalsSchema = z.object({
  net: grosze,
  gross: grosze,
  deposit: grosze,
  /** gross + deposit — "Do zapłaty z kaucją". */
  grossWithDeposit: grosze,
});
export type MoneyTotals = z.infer<typeof moneyTotalsSchema>;

/** GET /api/cart, and the body of PUT /api/cart/items. */
export const cartSchema = z.object({
  lines: z.array(cartLineSchema),
  totals: moneyTotalsSchema,
  /** The customer's global %. */
  discountPercent: z.number().min(0).max(100),
  /** Per-product rabaty apply: lines may carry other % than the global one. */
  productDiscounts: z.boolean(),
  hasPriceOnRequest: z.boolean(),
  /** Sum of quantities (header badge). */
  count: z.number().int().nonnegative(),
});
export type Cart = z.infer<typeof cartSchema>;

/** PUT /api/cart/items — sets the line quantity; qty 0 removes the line. */
export const putCartItemSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  variant: variantKeySchema.nullable(),
  qty: z.number().int().min(0).max(CART_MAX_QTY),
});
export type PutCartItemPayload = z.infer<typeof putCartItemSchema>;
