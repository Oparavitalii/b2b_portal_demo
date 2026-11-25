import { z } from 'zod';

import { moneyTotalsSchema } from './cart';
import { variantKeySchema } from './product';
import { customerShipmentSchema } from './shipment';

// Zamówienia (R-06, R-10) — mirror of Apps/Api_Php/src/Services/Orders_Service.php.
// Prices are frozen at sending time; no statuses, no payment (N-01, N-04).

const grosze = z.number().int();

export const ORDER_NOTE_MAX = 1000;

/** POST /api/orders. Empty note = no note. */
export const createOrderSchema = z.object({
  note: z
    .string()
    .trim()
    .max(ORDER_NOTE_MAX, `Uwagi mogą mieć najwyżej ${ORDER_NOTE_MAX} znaków`)
    .optional()
    .transform((value) => (value ? value : null)),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type CreateOrderPayload = z.output<typeof createOrderSchema>;

export const orderItemSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  variant: variantKeySchema.nullable(),
  qty: z.number().int().min(1),
  /** % the line was priced with when the order was sent. */
  discountPercent: z.number().min(0).max(100),
  priceOnRequest: z.boolean(),
  unitNet: grosze.nullable(),
  unitGross: grosze.nullable(),
  unitDeposit: grosze,
  lineNet: grosze.nullable(),
  lineGross: grosze.nullable(),
  lineDeposit: grosze,
});
export type OrderItem = z.infer<typeof orderItemSchema>;

/** Customer data as it was when the order was sent. */
export const orderCustomerSchema = z.object({
  companyName: z.string().nullable(),
  nip: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type OrderCustomer = z.infer<typeof orderCustomerSchema>;

/** Delivery address as it was when the order was sent. */
export const orderAddressSchema = z.object({
  companyName: z.string().nullable(),
  street: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  phone: z.string().nullable(),
});
export type OrderAddress = z.infer<typeof orderAddressSchema>;

/** One row of GET /api/orders. itemsCount = number of positions. */
export const orderSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  createdAt: z.string(),
  totals: moneyTotalsSchema,
  itemsCount: z.number().int().nonnegative(),
  hasPriceOnRequest: z.boolean(),
  /** Latest InPost shipment (B-22); the API leaves the key out when there is none. */
  shipment: customerShipmentSchema.nullable().default(null),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const orderListSchema = z.object({
  items: z.array(orderSummarySchema),
});
export type OrderList = z.infer<typeof orderListSchema>;

/** POST /api/orders (201) and GET /api/orders/:id. */
export const orderSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  createdAt: z.string(),
  discountPercent: z.number().min(0).max(100),
  /** Some line was priced with a per-product % other than the global one. */
  productDiscounts: z.boolean(),
  customer: orderCustomerSchema,
  address: orderAddressSchema,
  note: z.string().nullable(),
  totals: moneyTotalsSchema,
  hasPriceOnRequest: z.boolean(),
  itemsCount: z.number().int().nonnegative(),
  items: z.array(orderItemSchema),
  /** InPost shipments of the order, newest first (B-22). */
  shipments: z.array(customerShipmentSchema).default([]),
  /** Only on POST /api/orders: false when the company e-mail could not be sent. */
  mailSent: z.boolean().optional(),
});
export type Order = z.infer<typeof orderSchema>;
