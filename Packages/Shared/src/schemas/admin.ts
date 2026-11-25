import { z } from 'zod';

import { leadTimeHoursSchema } from '../availability';
import { moneyTotalsSchema } from './cart';
import { UserStatus } from './common';
import { orderCustomerSchema } from './order';
import { shipmentSchema } from './shipment';

// Admin panel contracts (R-02, R-16, R-25) — mirror of
// Apps/Api_Php/src/Services/Customers_Service.php and Import_Service.php.
// Money is integer grosze.

const grosze = z.number().int();

export const productSourceSchema = z.enum(['import', 'manual']);

/** GET /api/admin/customers item; PATCH /api/admin/customers/:id response. */
export const customerAdminSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  companyName: z.string().nullable(),
  nip: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  status: UserStatus,
  discountPercent: z.number().min(0).max(100),
  /** Linked szablon rabatów (live), or null. */
  discountTemplateId: z.string().uuid().nullable(),
  discountTemplateName: z.string().nullable(),
  /** The customer's own per-product / per-category rules. */
  customRulesCount: z.number().int().nonnegative(),
  /** Set when the admin blocked the account (no login, sessions ended); null otherwise. */
  blockedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CustomerAdmin = z.infer<typeof customerAdminSchema>;

export const customerAdminListSchema = z.array(customerAdminSchema);

/** R-02: one % on the whole catalogue, 0–100 in steps of 0.5 (API: 422 invalid_discount otherwise). */
export const DISCOUNT_STEP = 0.5;
export const updateDiscountSchema = z.object({
  discountPercent: z
    .number()
    .min(0, 'Rabat nie może być ujemny')
    .max(100, 'Rabat nie może przekraczać 100%')
    .refine((v) => Number.isInteger(v / DISCOUNT_STEP), {
      message: 'Rabat w krokach co 0,5%',
    }),
});
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;

// Per-product rabaty and szablony rabatów (Pilot_Run 2026-10-16) — mirror of
// Apps/Api_Php/src/Services/Discounts_Service.php. Resolution: own product → own category
// → szablon product → szablon category → the global %.

export const DISCOUNT_RULE_TYPES = ['category', 'product'] as const;
export const discountRuleTypeSchema = z.enum(DISCOUNT_RULE_TYPES);
export type DiscountRuleType = z.infer<typeof discountRuleTypeSchema>;
export const DISCOUNT_RULES_MAX = 1000;

const discountPercentSchema = updateDiscountSchema.shape.discountPercent;

/** One rule as sent (PUT / POST body). target = category name or SKU. */
export const discountRuleInputSchema = z.object({
  type: discountRuleTypeSchema,
  target: z.string().trim().min(1, 'Wybierz kategorię lub produkt').max(100),
  percent: discountPercentSchema,
});
export type DiscountRuleInput = z.infer<typeof discountRuleInputSchema>;

/** One rule as read; label = product name of a SKU rule (null for a category or a removed product). */
export const discountRuleSchema = z.object({
  type: discountRuleTypeSchema,
  target: z.string(),
  percent: z.number().min(0).max(100),
  label: z.string().nullable(),
});
export type DiscountRule = z.infer<typeof discountRuleSchema>;

const discountRulesInputSchema = z
  .array(discountRuleInputSchema)
  .max(DISCOUNT_RULES_MAX)
  .superRefine((rules, ctx) => {
    const seen = new Set<string>();
    rules.forEach((r, i) => {
      const key = `${r.type}:${r.target}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ta pozycja jest już na liście',
          path: [i, 'target'],
        });
      }
      seen.add(key);
    });
  });

/** GET /api/admin/discount-templates item; POST (201) / PUT response. */
export const discountTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  rules: z.array(discountRuleSchema),
  customersCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DiscountTemplate = z.infer<typeof discountTemplateSchema>;
export const discountTemplateListSchema = z.array(discountTemplateSchema);

/** POST /api/admin/discount-templates, PUT /api/admin/discount-templates/:id. */
export const discountTemplateInputSchema = z.object({
  name: z.string().trim().min(1, 'Podaj nazwę szablonu').max(80),
  rules: discountRulesInputSchema,
});
export type DiscountTemplateInput = z.infer<typeof discountTemplateInputSchema>;

/** GET /api/admin/customers/:id/discounts (and the PUT response). */
export const customerDiscountsSchema = z.object({
  discountPercent: z.number().min(0).max(100),
  templateId: z.string().uuid().nullable(),
  rules: z.array(discountRuleSchema),
});
export type CustomerDiscounts = z.infer<typeof customerDiscountsSchema>;

/** PUT /api/admin/customers/:id/discounts — szablon link and own rules, both replaced. */
export const customerDiscountsInputSchema = z.object({
  templateId: z.string().uuid().nullable(),
  rules: discountRulesInputSchema,
});
export type CustomerDiscountsInput = z.infer<
  typeof customerDiscountsInputSchema
>;

/** POST /api/admin/products/import response. `skipped` = Polish reasons, one per record. */
export const importResultSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  deactivated: z.number().int(),
  skipped: z.array(z.string()),
});
export type ImportResult = z.infer<typeof importResultSchema>;

/** GET /api/admin/products item (incl. inactive products). */
export const adminProductSchema = z.object({
  sku: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  producer: z.string().nullable(),
  image: z.string().nullable(),
  imageUrl: z.string().nullable(),
  active: z.boolean(),
  priceOnRequest: z.boolean(),
  priceGross: grosze.nullable(),
  depositGross: grosze,
  variants: z
    .record(
      z.enum(['oryginalne', 'zamienne']),
      z.object({ priceGross: grosze }),
    )
    .nullable(),
  importedAt: z.string(),
  /** Pieces in stock (4 by default); display only, orders never lower it. */
  stock: z.number().int().nonnegative(),
  /** 24 | 48 | 72 set by the admin, null = automatic (24 h from stock, 72 h production). */
  leadTimeHours: leadTimeHoursSchema.nullable(),
  /** 'manual' = added in the panel; the JSON import never hides it. */
  source: productSourceSchema,
  updatedAt: z.string().nullable(),
});
export type AdminProduct = z.infer<typeof adminProductSchema>;

export const adminProductListSchema = z.object({
  items: z.array(adminProductSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminProductList = z.infer<typeof adminProductListSchema>;

export const adminProductListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;

/** GET /api/admin/orders item — every order received (no order statuses: N-04; shipment status from InPost, B-22). */
export const adminOrderSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  createdAt: z.string(),
  customer: orderCustomerSchema,
  /** The customer account was deleted after sending; the order keeps its snapshot. */
  accountDeleted: z.boolean(),
  totals: moneyTotalsSchema,
  itemsCount: z.number().int().nonnegative(),
  hasPriceOnRequest: z.boolean(),
  /** Latest InPost shipment (B-22); the API leaves the key out when there is none. */
  shipment: shipmentSchema.nullable().default(null),
});
export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;

export const adminOrderListSchema = z.object({
  items: z.array(adminOrderSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminOrderList = z.infer<typeof adminOrderListSchema>;

// Product editing in the panel (Pilot_Run 2026-10-10) — mirror of
// Apps/Api_Php/src/Services/Admin_Products.php.

/** GET/PATCH /api/admin/products/:sku, POST /api/admin/products (201). */
export const adminProductDetailSchema = z.object({
  sku: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  producer: z.string().nullable(),
  priceOnRequest: z.boolean(),
  priceGross: grosze.nullable(),
  depositGross: grosze,
  /** Prices of the oryginalne / zamienne versions come from the import only. */
  hasVariants: z.boolean(),
  makes: z.array(z.string()),
  oeNumbers: z.array(z.string()),
  description: z.string().nullable(),
  stock: z.number().int().nonnegative(),
  leadTimeHours: leadTimeHoursSchema.nullable(),
  active: z.boolean(),
  image: z.string().nullable(),
  imageUrl: z.string().nullable(),
  source: productSourceSchema,
  importedAt: z.string(),
  updatedAt: z.string().nullable(),
});
export type AdminProductDetail = z.infer<typeof adminProductDetailSchema>;

/** GET /api/admin/products/options — values already in use, for the form pickers. */
export const adminProductOptionsSchema = z.object({
  categories: z.array(z.string()),
  producers: z.array(z.string()),
  makes: z.array(z.string()),
});
export type AdminProductOptions = z.infer<typeof adminProductOptionsSchema>;

export const PRODUCT_SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,63}$/;
export const PRODUCT_STOCK_MAX = 99_999;
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Body of POST (sku + name required) and PATCH (any subset, no sku). */
export const productInputSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .regex(
        PRODUCT_SKU_RE,
        'SKU: litery, cyfry, kropka, myślnik, spacja (bez „/”)',
      ),
    name: z.string().trim().min(1, 'Podaj nazwę').max(200),
    category: z.string().trim().max(100).nullable(),
    producer: z.string().trim().max(100).nullable(),
    priceOnRequest: z.boolean(),
    priceGross: grosze.nonnegative().nullable(),
    depositGross: grosze.nonnegative(),
    makes: z.array(z.string().trim().min(1).max(100)).max(50),
    oeNumbers: z.array(z.string().trim().min(1).max(100)).max(100),
    description: z.string().max(10_000).nullable(),
    stock: z
      .number({ invalid_type_error: 'Podaj stan' })
      .int('Stan w całych sztukach')
      .min(0, 'Stan nie może być ujemny')
      .max(PRODUCT_STOCK_MAX),
    leadTimeHours: leadTimeHoursSchema.nullable(),
    active: z.boolean(),
  })
  .refine((v) => v.priceOnRequest || v.priceGross !== null, {
    message: 'Podaj cenę albo zaznacz „Cena na zapytanie”',
    path: ['priceGross'],
  });
export type ProductInput = z.infer<typeof productInputSchema>;

// Bulk edit (owner, 2026-10-12) — mirror of AdminProducts::bulk.
export const PRODUCT_BULK_MAX = 2000;
export const PRODUCT_PRICE_PERCENT_MIN = -90;
export const PRODUCT_PRICE_PERCENT_MAX = 900;

/** GET /api/admin/products/skus?q= — every SKU the admin search matches ("select all"). */
export const adminProductSkusSchema = z.object({ skus: z.array(z.string()) });

/**
 * POST /api/admin/products/bulk. A field left out stays as it is; leadTimeHours null =
 * automatic. The price is either set (priceGross) or moved by a percentage (pricePercent).
 */
export const bulkProductInputSchema = z
  .object({
    skus: z.array(z.string().min(1)).min(1).max(PRODUCT_BULK_MAX),
    priceGross: grosze.nonnegative().optional(),
    pricePercent: z
      .number()
      .min(PRODUCT_PRICE_PERCENT_MIN)
      .max(PRODUCT_PRICE_PERCENT_MAX)
      .optional(),
    stock: z.number().int().min(0).max(PRODUCT_STOCK_MAX).optional(),
    leadTimeHours: leadTimeHoursSchema.nullable().optional(),
  })
  .refine((v) => v.priceGross === undefined || v.pricePercent === undefined, {
    message: 'Cena: kwota albo procent',
    path: ['pricePercent'],
  });
export type BulkProductInput = z.infer<typeof bulkProductInputSchema>;

/** priceSkipped = products with a price on request, which a percentage cannot move. */
export const bulkProductResultSchema = z.object({
  updated: z.number().int(),
  notFound: z.number().int(),
  priceSkipped: z.number().int(),
});
export type BulkProductResult = z.infer<typeof bulkProductResultSchema>;
