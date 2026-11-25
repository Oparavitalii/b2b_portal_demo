import { z } from 'zod';

// InPost shipments (B-22: R-02, R-03, R-05, R-06) — mirror of
// Apps/Api_Php/src/Services/Shipments_Service.php. The ShipX token never
// reaches the web; the Geowidget token only through GET /api/admin/inpost/config.

export const SHIPMENT_SERVICES = [
  'inpost_locker_standard',
  'inpost_courier_standard',
] as const;

export const shipmentKindSchema = z.enum(['locker', 'courier']);
export type ShipmentKind = z.infer<typeof shipmentKindSchema>;

/** Paczkomat sizes A / B / C (ShipX templates). Default B. */
export const parcelSizeSchema = z.enum(['small', 'medium', 'large']);
export type ParcelSize = z.infer<typeof parcelSizeSchema>;
export const PARCEL_SIZE_LABELS: Record<ParcelSize, string> = {
  small: 'A — 8 × 38 × 64 cm',
  medium: 'B — 19 × 38 × 64 cm',
  large: 'C — 41 × 38 × 64 cm',
};
export const DEFAULT_PARCEL_SIZE: ParcelSize = 'medium';

/** Never refreshed again by the API. */
export const FINAL_SHIPMENT_STATUSES = [
  'delivered',
  'returned_to_sender',
  'canceled',
  'undelivered',
  'rejected_by_receiver',
] as const;

/** Polish ShipX titles (GET /v1/statuses?lang=pl_PL). Unknown status → raw name. */
export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  created: 'Przesyłka utworzona',
  offers_prepared: 'Przygotowano oferty',
  offer_selected: 'Oferta wybrana',
  confirmed: 'Przygotowana przez Nadawcę',
  dispatched_by_sender: 'Paczka nadana w automacie Paczkomat',
  collected_from_sender: 'Odebrana od klienta',
  taken_by_courier: 'Odebrana od Nadawcy',
  adopted_at_source_branch: 'Przyjęta w oddziale InPost',
  sent_from_source_branch: 'W trasie',
  adopted_at_sorting_center: 'Przyjęta w Sortowni',
  sent_from_sorting_center: 'Wysłana z Sortowni',
  adopted_at_target_branch: 'Przyjęta w Oddziale Docelowym',
  out_for_delivery: 'Przekazano do doręczenia',
  out_for_delivery_to_address: 'W doręczeniu',
  ready_to_pickup: 'Umieszczona w automacie Paczkomat (odbiorczym)',
  pickup_reminder_sent: 'Przypomnienie o czekającej paczce',
  delivered: 'Dostarczona',
  pickup_time_expired: 'Upłynął termin odbioru',
  avizo: 'Powrót do oddziału',
  returned_to_sender: 'Zwrot do nadawcy',
  canceled: 'Anulowano etykietę',
  undelivered: 'Przekazanie do magazynu przesyłek niedoręczalnych',
  rejected_by_receiver: 'Odmowa przyjęcia',
  delay_in_delivery: 'Możliwe opóźnienie doręczenia',
  ready_to_pickup_from_pok: 'Czeka na odbiór w PaczkoPunkcie',
  dispatched_by_sender_to_pok: 'Nadana w PaczkoPunkcie',
  other: 'Inny status',
};

export function shipmentStatusLabel(status: string): string {
  return SHIPMENT_STATUS_LABELS[status] ?? status;
}

/** Badge stage: one colour per stage. */
export type ShipmentStage =
  'prepared' | 'transit' | 'pickup' | 'delivered' | 'problem';

export const SHIPMENT_STAGES: Record<
  ShipmentStage,
  { label: string; color: 'gray' | 'blue' | 'yellow' | 'green' | 'red' }
> = {
  prepared: { label: 'Przygotowana', color: 'gray' },
  transit: { label: 'W drodze', color: 'blue' },
  pickup: { label: 'Do odbioru', color: 'yellow' },
  delivered: { label: 'Dostarczona', color: 'green' },
  problem: { label: 'Problem', color: 'red' },
};

const PREPARED = new Set([
  'created',
  'offers_prepared',
  'offer_selected',
  'confirmed',
]);
const PROBLEM = new Set([
  'returned_to_sender',
  'canceled',
  'undelivered',
  'rejected_by_receiver',
  'pickup_time_expired',
]);

export function shipmentStage(status: string): ShipmentStage {
  if (status === 'delivered') return 'delivered';
  if (PROBLEM.has(status)) return 'problem';
  if (PREPARED.has(status)) return 'prepared';
  if (status.startsWith('ready_to_pickup') || status === 'pickup_reminder_sent')
    return 'pickup';
  return 'transit';
}

export const TRACKING_URL_BASE =
  'https://inpost.pl/sledzenie-przesylek?number=';

export function trackingUrl(trackingNumber: string): string {
  return TRACKING_URL_BASE + encodeURIComponent(trackingNumber);
}

/** Locker / PaczkoPunkt (GET /api/admin/inpost/points). */
export const pointSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string(),
  description: z.string().nullable(),
  distanceM: z.number().nullable(),
  open247: z.boolean(),
});
export type Point = z.infer<typeof pointSchema>;

export const pointListSchema = z.object({ items: z.array(pointSchema) });
export type PointList = z.infer<typeof pointListSchema>;

export const POST_CODE_RE = /^\d{2}-\d{3}$/;

/** Receiver of a shipment. Phone: 9 digits (the API strips +48 and spaces). */
export const receiverSchema = z.object({
  companyName: z.string().trim().max(100).nullable(),
  firstName: z.string().trim().min(1, 'Podaj imię').max(60),
  lastName: z.string().trim().min(1, 'Podaj nazwisko').max(60),
  email: z.string().trim().email('Nieprawidłowy e-mail').max(200),
  phone: z
    .string()
    .trim()
    .refine(
      (v) => /^(?:\+?48)?\d{9}$/.test(v.replace(/[\s-]/g, '')),
      'Telefon: 9 cyfr',
    ),
  street: z.string().trim().max(100).nullable(),
  buildingNumber: z.string().trim().max(20).nullable(),
  city: z.string().trim().max(100).nullable(),
  postCode: z
    .string()
    .trim()
    .regex(POST_CODE_RE, 'Kod pocztowy w formacie 00-000')
    .nullable(),
});
export type Receiver = z.infer<typeof receiverSchema>;

export const parcelDimensionsSchema = z.object({
  lengthMm: z.number().int().min(1).max(10_000),
  widthMm: z.number().int().min(1).max(10_000),
  heightMm: z.number().int().min(1).max(10_000),
  weightKg: z.number().min(0.01).max(1000),
});
export type ParcelDimensions = z.infer<typeof parcelDimensionsSchema>;

/** Stored parcel: a Paczkomat template or courier dimensions. */
export const shipmentParcelSchema = z.union([
  z.object({ template: parcelSizeSchema }),
  parcelDimensionsSchema,
]);
export type ShipmentParcel = z.infer<typeof shipmentParcelSchema>;

/** POST /api/admin/orders/:id/shipments. */
export const createShipmentSchema = z
  .object({
    kind: shipmentKindSchema,
    targetPoint: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{3,32}$/, 'Nieprawidłowy kod punktu')
      .optional(),
    size: parcelSizeSchema.optional(),
    parcel: parcelDimensionsSchema.optional(),
    receiver: receiverSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'locker' && !v.targetPoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Wybierz Paczkomat',
        path: ['targetPoint'],
      });
    }
    if (v.kind === 'courier') {
      if (!v.parcel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Podaj wymiary i wagę',
          path: ['parcel'],
        });
      }
      for (const key of [
        'street',
        'buildingNumber',
        'city',
        'postCode',
      ] as const) {
        if (!v.receiver[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Wymagane dla kuriera',
            path: ['receiver', key],
          });
        }
      }
    }
  });
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

export const shipmentEventSchema = z.object({
  status: z.string(),
  statusLabel: z.string(),
  at: z.string(),
});
export type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

export const targetPointInfoSchema = z.object({
  line1: z.string(),
  line2: z.string(),
  description: z.string().nullable(),
});

/** Admin view of a shipment. */
export const shipmentSchema = z.object({
  id: z.string().uuid(),
  service: z.string(),
  kind: shipmentKindSchema,
  targetPoint: z.string().nullable(),
  targetPointInfo: targetPointInfoSchema.nullable(),
  parcel: shipmentParcelSchema,
  status: z.string(),
  statusLabel: z.string(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  labelReady: z.boolean(),
  events: z.array(shipmentEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Shipment = z.infer<typeof shipmentSchema>;

/** Customer view („Moje zamówienia”): no id, parcel, labelReady. */
export const customerShipmentSchema = shipmentSchema.omit({
  id: true,
  parcel: true,
  labelReady: true,
});
export type CustomerShipment = z.infer<typeof customerShipmentSchema>;

/** GET /api/admin/orders/:id/shipping. */
export const shippingInfoSchema = z.object({
  shipments: z.array(shipmentSchema),
  suggestedPoints: z.array(pointSchema),
  postCode: z.string().nullable(),
  receiver: z.object({
    companyName: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
    street: z.string().nullable(),
    buildingNumber: z.string().nullable(),
    city: z.string().nullable(),
    postCode: z.string().nullable(),
  }),
});
export type ShippingInfo = z.infer<typeof shippingInfoSchema>;

/** GET /api/admin/inpost/config. */
export const inpostConfigSchema = z.object({
  geowidgetToken: z.string().nullable(),
});
export type InpostConfig = z.infer<typeof inpostConfigSchema>;

/** Error codes of the shipment endpoints → Polish message. */
export const SHIPMENT_ERROR_MESSAGES: Record<string, string> = {
  inpost_error: 'InPost odrzucił żądanie.',
  inpost_not_configured: 'Integracja InPost nie jest skonfigurowana.',
  label_not_ready: 'Etykieta nie jest jeszcze gotowa — odśwież status.',
  target_point_required: 'Wybierz Paczkomat.',
  unknown_target_point: 'InPost nie zna takiego Paczkomatu — sprawdź kod.',
  parcel_required: 'Podaj wymiary i wagę paczki.',
  receiver_address_required: 'Kurier wymaga pełnego adresu odbiorcy.',
  invalid_phone: 'Telefon odbiorcy musi mieć 9 cyfr.',
  invalid_post_code: 'Kod pocztowy w formacie 00-000.',
};
