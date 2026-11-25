import { z } from 'zod';

import { leadTimeHoursSchema } from '../availability';

// Catalogue contracts (R-17, R-21, R-22) — mirror of
// Apps/Api_Php/src/Services/Products_Service.php. Money is integer grosze.

export const VARIANT_KEYS = ['oryginalne', 'zamienne'] as const;
export const variantKeySchema = z.enum(VARIANT_KEYS);
export type VariantKey = z.infer<typeof variantKeySchema>;

const grosze = z.number().int();

/** Unit price for the signed-in user's discount; null on the card means "Cena na zapytanie".
 *  listNet/listGross = the price before the discount, present only when there is one. */
export const productPriceSchema = z.object({
  unitNet: grosze,
  unitGross: grosze,
  unitDeposit: grosze,
  listNet: grosze.optional(),
  listGross: grosze.optional(),
});
export type ProductPrice = z.infer<typeof productPriceSchema>;

export const productVariantSchema = z.object({
  key: variantKeySchema,
  price: z
    .object({
      unitNet: grosze,
      unitGross: grosze,
      listNet: grosze.optional(),
      listGross: grosze.optional(),
    })
    .nullable(),
});
export type ProductVariant = z.infer<typeof productVariantSchema>;

export const productCardSchema = z.object({
  sku: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  producer: z.string().nullable(),
  image: z.string().nullable(),
  imageUrl: z.string().nullable(),
  makes: z.array(z.string()),
  priceOnRequest: z.boolean(),
  price: productPriceSchema.nullable(),
  hasVariants: z.boolean(),
  variants: z.array(productVariantSchema),
  /** Pieces in stock, set in the admin panel (4 by default). Display only: orders never lower it. */
  stock: z.number().int().nonnegative(),
  /** Delivery time the admin set, or null = automatic (24 h from stock, 72 h production). */
  leadTimeHours: leadTimeHoursSchema.nullable(),
  /** The signed-in customer's % on this product (per-product rabat, else the global %). */
  discountPercent: z.number().min(0).max(100),
});
export type ProductCard = z.infer<typeof productCardSchema>;

export const productApplicationSchema = z.object({
  marka: z.string(),
  model: z.string(),
  silnik: z.string(),
  lata: z.string(),
});
export type ProductApplication = z.infer<typeof productApplicationSchema>;

export const productDetailSchema = productCardSchema.extend({
  oeNumbers: z.array(z.string()),
  engineCodes: z.array(z.string()),
  applications: z.array(productApplicationSchema),
  description: z.string().nullable(),
  /** typ, stan, gwarancja, ... — values as imported from Products_Data.json. */
  attributes: z.record(z.unknown()),
  /** The customer has per-product / per-category rabaty (prices may differ from the global %). */
  productDiscounts: z.boolean(),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const facetValueSchema = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
});
export type FacetValue = z.infer<typeof facetValueSchema>;

export const PRODUCT_PAGE_SIZE = 24;

/** GET /api/products query. Empty strings mean "no filter". */
export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  make: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(PRODUCT_PAGE_SIZE),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductListQueryInput = z.input<typeof productListQuerySchema>;

export const productListResponseSchema = z.object({
  items: z.array(productCardSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** The customer's global %; each card carries its own discountPercent. */
  discountPercent: z.number().min(0).max(100),
  productDiscounts: z.boolean(),
  facets: z.object({
    categories: z.array(facetValueSchema),
    makes: z.array(facetValueSchema),
  }),
});
export type ProductListResponse = z.infer<typeof productListResponseSchema>;

// Display helpers live in ../pricing.ts; re-exported here because the package
// exports map only exposes '.' and './schemas/*'.
export { formatNetGross, formatPLN } from '../pricing';
export {
  availability,
  type Availability,
  LEAD_TIME_IN_STOCK_H,
  LEAD_TIME_PRODUCTION_H,
  LEAD_TIMES,
  type LeadTimeHours,
  leadTimeHoursSchema,
  stockDefaults,
  TO_ORDER_CATEGORIES,
} from '../availability';
