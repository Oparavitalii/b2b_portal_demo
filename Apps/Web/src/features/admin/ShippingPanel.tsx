import {
  type CreateShipmentInput,
  createShipmentSchema,
  DEFAULT_PARCEL_SIZE,
  PARCEL_SIZE_LABELS,
  type ParcelSize,
  parcelSizeSchema,
  type Point,
  POST_CODE_RE,
  type Shipment,
  type ShipmentParcel,
  type ShippingInfo,
} from '@catalog/shared/schemas/shipment';
import {
  Alert,
  Button,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  CheckCircle2,
  FileDown,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { formatDateTime } from '@/lib/format';
import { parseApiError } from '@/lib/http';

import { ShipmentBadge, TrackingLink } from '../orders/ShipmentStatus';
import {
  shipmentErrorText,
  useCreateShipment,
  useDownloadLabel,
  useInpostConfig,
  useInpostPoints,
  useLookupPoint,
  useOrderShipping,
  useRefreshShipment,
} from './api';
import { GeowidgetModal } from './Geowidget';
import classes from './Shipping.module.css';

// InPost shipping of one order (B-22: R-02, R-04, R-05, R-06, R-09). The admin
// picks the Paczkomat (nearest to the delivery post code, on the InPost map,
// or by its code) or the courier, confirms the paid shipment, then downloads
// the label and follows the status. A refused shipment shows InPost's own
// message and leaves the order untouched.

type Kind = CreateShipmentInput['kind'];

type ReceiverForm = Record<
  | 'companyName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'street'
  | 'buildingNumber'
  | 'city'
  | 'postCode',
  string
>;

type Dims = Record<
  'lengthMm' | 'widthMm' | 'heightMm' | 'weightKg',
  number | ''
>;

interface SelectedPoint {
  name: string;
  info: Point | null;
}

const SIZE_OPTIONS = parcelSizeSchema.options.map((size) => ({
  value: size,
  label: PARCEL_SIZE_LABELS[size],
}));

function sizeLetter(size: ParcelSize): string {
  return PARCEL_SIZE_LABELS[size].charAt(0);
}

function parcelText(parcel: ShipmentParcel): string {
  if ('template' in parcel) return `Gabaryt ${sizeLetter(parcel.template)}`;
  const cm = (mm: number) => Math.round(mm / 10);
  return `${cm(parcel.lengthMm)} × ${cm(parcel.widthMm)} × ${cm(parcel.heightMm)} cm, ${parcel.weightKg} kg`;
}

function distanceText(m: number | null): string {
  if (m === null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function pointAddress(p: Pick<Point, 'line1' | 'line2'>): string {
  return [p.line1, p.line2].filter(Boolean).join(', ');
}

function orNull(value: string): string | null {
  const v = value.trim();
  return v === '' ? null : v;
}

// ---------------------------------------------------------------------------
// Shipments of the order: status, tracking, label, refresh.
// ---------------------------------------------------------------------------

function ShipmentsTable({
  orderId,
  shipments,
}: {
  orderId: string;
  shipments: Shipment[];
}) {
  const refresh = useRefreshShipment(orderId);
  const label = useDownloadLabel();
  const actionError = refresh.error ?? label.error;

  if (shipments.length === 0) {
    return (
      <Text size='sm' c='cdmInk.6'>
        Do tego zamówienia nie utworzono jeszcze przesyłki.
      </Text>
    );
  }

  return (
    <Stack gap='sm'>
      {actionError ? (
        <Alert
          color='red'
          variant='light'
          title={
            refresh.error
              ? 'Nie udało się odświeżyć statusu'
              : 'Nie udało się pobrać etykiety'
          }
          withCloseButton
          onClose={() => {
            refresh.reset();
            label.reset();
          }}
        >
          {shipmentErrorText(actionError)}
        </Alert>
      ) : null}
      <div className={classes.tableBox}>
        <Table verticalSpacing='sm' striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Utworzono</Table.Th>
              <Table.Th>Usługa</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Numer przesyłki</Table.Th>
              <Table.Th>Akcje</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shipments.map((s) => {
              const refreshing =
                refresh.isPending && refresh.variables === s.id;
              const downloading =
                label.isPending && label.variables?.id === s.id;
              return (
                <Table.Tr key={s.id}>
                  <Table.Td className={classes.nowrap}>
                    {formatDateTime(s.createdAt)}
                  </Table.Td>
                  <Table.Td>
                    <Text size='sm' fw={600}>
                      {s.kind === 'courier'
                        ? 'Kurier'
                        : `Paczkomat ${s.targetPoint ?? ''}`}
                    </Text>
                    <Text size='xs' c='cdmInk.6'>
                      {parcelText(s.parcel)}
                    </Text>
                    {s.targetPointInfo ? (
                      <Text size='xs' c='cdmInk.6'>
                        {pointAddress(s.targetPointInfo)}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2} align='flex-start'>
                      <ShipmentBadge shipment={s} />
                      <Text size='xs'>{s.statusLabel}</Text>
                      <Text size='xs' c='cdmInk.6'>
                        od {formatDateTime(s.updatedAt)}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <TrackingLink shipment={s} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap='xs' wrap='nowrap'>
                      <Button
                        size='xs'
                        variant='light'
                        color='cdmInk'
                        leftSection={<FileDown size={14} aria-hidden />}
                        disabled={!s.labelReady}
                        loading={downloading}
                        title={
                          s.labelReady
                            ? 'Pobierz etykietę A6 (PDF)'
                            : 'Etykieta będzie dostępna po potwierdzeniu przesyłki przez InPost — odśwież status'
                        }
                        onClick={() => {
                          refresh.reset();
                          label.mutate(s);
                        }}
                      >
                        Etykieta PDF
                      </Button>
                      <Button
                        size='xs'
                        variant='default'
                        leftSection={<RefreshCw size={14} aria-hidden />}
                        loading={refreshing}
                        onClick={() => {
                          label.reset();
                          refresh.mutate(s.id);
                        }}
                      >
                        Odśwież
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Paczkomat choice: nearest list, InPost map, point code (R-05).
// ---------------------------------------------------------------------------

function PointPicker({
  info,
  selected,
  onSelect,
  error,
}: {
  info: ShippingInfo;
  selected: SelectedPoint | null;
  onSelect: (point: SelectedPoint) => void;
  error: string | undefined;
}) {
  const [postCodeInput, setPostCodeInput] = useState(info.postCode ?? '');
  const [searchCode, setSearchCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const searched = useInpostPoints(searchCode);
  const lookup = useLookupPoint();
  const config = useInpostConfig();
  const token = config.data?.geowidgetToken ?? null;

  const points =
    searchCode !== '' ? (searched.data ?? []) : info.suggestedPoints;
  const listCode = searchCode !== '' ? searchCode : info.postCode;
  const postCodeValid = POST_CODE_RE.test(postCodeInput.trim());

  const checkCode = (name: string, keepOnFailure: boolean) => {
    const code = name.trim().toUpperCase();
    if (code === '') return;
    if (keepOnFailure) onSelect({ name: code, info: null });
    lookup.mutate(code, {
      onSuccess: (point) => {
        onSelect({ name: point.name, info: point });
        setCodeInput('');
      },
    });
  };

  const lookupError = lookup.isError
    ? parseApiError(lookup.error).status === 404
      ? 'InPost nie zna punktu o takim kodzie.'
      : shipmentErrorText(lookup.error)
    : null;

  return (
    <Stack gap='sm'>
      <form
        className={classes.inlineRow}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (postCodeValid) setSearchCode(postCodeInput.trim());
        }}
      >
        <TextInput
          label='Najbliższe Paczkomaty przy kodzie pocztowym'
          placeholder='00-000'
          value={postCodeInput}
          onChange={(e) => setPostCodeInput(e.currentTarget.value)}
          error={
            postCodeInput.trim() !== '' && !postCodeValid
              ? 'Kod w formacie 00-000'
              : undefined
          }
        />
        <Button
          type='submit'
          variant='default'
          leftSection={<Search size={16} aria-hidden />}
          disabled={!postCodeValid}
          loading={searched.isFetching}
        >
          Szukaj
        </Button>
        <Button
          variant='light'
          color='cdmInk'
          leftSection={<MapPin size={16} aria-hidden />}
          disabled={!token}
          loading={config.isPending}
          title={
            token
              ? 'Otwórz mapę Paczkomatów InPost'
              : 'Mapa niedostępna (brak tokenu Geowidget) — użyj listy lub kodu punktu'
          }
          onClick={() => setMapOpen(true)}
        >
          Mapa
        </Button>
      </form>

      {searchCode !== '' && searched.isError ? (
        <Alert color='red' variant='light'>
          {shipmentErrorText(searched.error)}
        </Alert>
      ) : null}

      {points.length > 0 ? (
        <ul className={classes.pointList} aria-label='Najbliższe Paczkomaty'>
          {points.map((p) => {
            const active = selected?.name === p.name;
            return (
              <li key={p.name}>
                <button
                  type='button'
                  className={
                    active ? classes.pointOptionActive : classes.pointOption
                  }
                  aria-pressed={active}
                  onClick={() => onSelect({ name: p.name, info: p })}
                >
                  {active ? (
                    <CheckCircle2 size={18} aria-hidden />
                  ) : (
                    <Package size={18} aria-hidden />
                  )}
                  <span className={classes.pointMain}>
                    <span className={classes.pointName}>{p.name}</span>{' '}
                    {pointAddress(p)}
                    {p.description ? (
                      <span className={classes.pointMeta}>
                        <br />
                        {p.description}
                      </span>
                    ) : null}
                  </span>
                  <span className={classes.pointMeta}>
                    {distanceText(p.distanceM)}
                    {p.open247 ? (
                      <>
                        <br />
                        24/7
                      </>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : searched.isFetching ? (
        <Loader size='sm' />
      ) : (
        <Text size='sm' c='cdmInk.6'>
          {listCode
            ? `Brak czynnych Paczkomatów w pobliżu ${listCode} — użyj mapy lub wpisz kod punktu.`
            : 'Zamówienie nie ma kodu pocztowego dostawy — wpisz kod powyżej, użyj mapy albo wpisz kod punktu.'}
        </Text>
      )}

      <form
        className={classes.inlineRow}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          checkCode(codeInput, false);
        }}
      >
        <TextInput
          label='Kod Paczkomatu'
          placeholder='np. WRO115M'
          value={codeInput}
          onChange={(e) => setCodeInput(e.currentTarget.value)}
        />
        <Button
          type='submit'
          variant='default'
          disabled={codeInput.trim() === ''}
          loading={lookup.isPending}
        >
          Sprawdź
        </Button>
      </form>
      {lookupError ? (
        <Alert color='red' variant='light'>
          {lookupError}
        </Alert>
      ) : null}

      <div className={classes.selected} aria-live='polite'>
        {selected ? (
          <Text size='sm'>
            Wybrany Paczkomat: <strong>{selected.name}</strong>
            {selected.info ? `, ${pointAddress(selected.info)}` : ''}
            {selected.info?.description
              ? ` (${selected.info.description})`
              : ''}
          </Text>
        ) : (
          <Text size='sm' c={error ? 'red' : 'cdmInk.6'}>
            {error ?? 'Nie wybrano Paczkomatu.'}
          </Text>
        )}
      </div>

      {token ? (
        <GeowidgetModal
          opened={mapOpen}
          token={token}
          onClose={() => setMapOpen(false)}
          onPick={(name) => checkCode(name, true)}
        />
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// New shipment: Paczkomat A/B/C or courier, receiver, confirm (R-04, R-06).
// ---------------------------------------------------------------------------

function NewShipmentForm({
  orderId,
  orderNumber,
  info,
}: {
  orderId: string;
  orderNumber: string;
  info: ShippingInfo;
}) {
  const create = useCreateShipment(orderId);
  const [kind, setKind] = useState<Kind>('locker');
  const [size, setSize] = useState<ParcelSize>(DEFAULT_PARCEL_SIZE);
  const [point, setPoint] = useState<SelectedPoint | null>(() => {
    const first = info.suggestedPoints[0];
    return first ? { name: first.name, info: first } : null;
  });
  const [dims, setDims] = useState<Dims>({
    lengthMm: '',
    widthMm: '',
    heightMm: '',
    weightKg: '',
  });
  const r = info.receiver;
  const [receiver, setReceiver] = useState<ReceiverForm>({
    companyName: r.companyName ?? '',
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    street: r.street ?? '',
    buildingNumber: r.buildingNumber ?? '',
    city: r.city ?? '',
    postCode: r.postCode ?? info.postCode ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (key: keyof ReceiverForm) => (value: string) =>
    setReceiver((prev) => ({ ...prev, [key]: value }));

  const setDim = (key: keyof Dims) => (value: string | number) =>
    setDims((prev) => ({
      ...prev,
      [key]: typeof value === 'number' ? value : '',
    }));

  const buildInput = () => ({
    kind,
    ...(kind === 'locker'
      ? { targetPoint: point?.name, size }
      : {
          parcel: {
            lengthMm: dims.lengthMm === '' ? undefined : dims.lengthMm,
            widthMm: dims.widthMm === '' ? undefined : dims.widthMm,
            heightMm: dims.heightMm === '' ? undefined : dims.heightMm,
            weightKg: dims.weightKg === '' ? undefined : dims.weightKg,
          },
        }),
    receiver: {
      companyName: orNull(receiver.companyName),
      firstName: receiver.firstName,
      lastName: receiver.lastName,
      email: receiver.email,
      phone: receiver.phone,
      street: orNull(receiver.street),
      buildingNumber: orNull(receiver.buildingNumber),
      city: orNull(receiver.city),
      postCode: orNull(receiver.postCode),
    },
  });

  // Not a <form>: the point picker inside has its own small forms, and a paid
  // shipment is never sent by pressing Enter in a field.
  const submit = () => {
    create.reset();
    const parsed = createShipmentSchema.safeParse(buildInput());
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (!next[key]) next[key] = issue.message;
      }
      // A missing dimension shows on the field, not only on "parcel".
      if (kind === 'courier') {
        for (const key of [
          'lengthMm',
          'widthMm',
          'heightMm',
          'weightKg',
        ] as const) {
          if (dims[key] === '' && !next[`parcel.${key}`]) {
            next[`parcel.${key}`] = 'Wymagane';
          }
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    const input = parsed.data;
    const rec = input.receiver;
    modals.openConfirmModal({
      title: 'Utworzyć płatną przesyłkę InPost?',
      children: (
        <Stack gap='xs'>
          <Text size='sm'>
            InPost od razu kupi przesyłkę i pobierze opłatę z konta firmy.
            Anulować ją można tylko w Managerze Paczek.
          </Text>
          <Text size='sm'>
            Zamówienie: <strong>{orderNumber}</strong>
          </Text>
          <Text size='sm'>
            {input.kind === 'locker'
              ? `Paczkomat ${input.targetPoint ?? ''}${point?.info ? `, ${pointAddress(point.info)}` : ''} — gabaryt ${sizeLetter(input.size ?? DEFAULT_PARCEL_SIZE)}`
              : `Kurier — ${input.parcel ? parcelText(input.parcel) : ''}, ${rec.street ?? ''} ${rec.buildingNumber ?? ''}, ${rec.postCode ?? ''} ${rec.city ?? ''}`}
          </Text>
          <Text size='sm'>
            Odbiorca:{' '}
            {[rec.companyName, `${rec.firstName} ${rec.lastName}`]
              .filter(Boolean)
              .join(', ')}
            , {rec.email}, tel. {rec.phone}
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Tak, utwórz przesyłkę', cancel: 'Anuluj' },
      confirmProps: { color: 'cdmInk' },
      onConfirm: () =>
        create.mutate(input, {
          onSuccess: (shipment) =>
            notifications.show({
              color: 'green',
              title: 'Utworzono przesyłkę InPost',
              message: shipment.trackingNumber
                ? `Numer przesyłki: ${shipment.trackingNumber}`
                : 'InPost jeszcze przygotowuje numer — za chwilę kliknij „Odśwież”.',
            }),
        }),
    });
  };

  const err = (key: string) => errors[key];

  return (
    <div>
      <Stack gap='md'>
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v === 'courier' ? 'courier' : 'locker')}
          data={[
            { value: 'locker', label: 'Paczkomat' },
            { value: 'courier', label: 'Kurier' },
          ]}
          aria-label='Rodzaj przesyłki'
        />

        {kind === 'locker' ? (
          <>
            <PointPicker
              info={info}
              selected={point}
              onSelect={(p) => {
                setPoint(p);
                setErrors((prev) => {
                  const { targetPoint: _dropped, ...rest } = prev;
                  return rest;
                });
              }}
              error={err('targetPoint')}
            />
            <Select
              label='Gabaryt'
              data={SIZE_OPTIONS}
              value={size}
              onChange={(v) => {
                const parsed = parcelSizeSchema.safeParse(v);
                if (parsed.success) setSize(parsed.data);
              }}
              allowDeselect={false}
              maw={320}
            />
          </>
        ) : (
          <div>
            <h4 className={classes.sectionTitle}>Paczka</h4>
            <div className={classes.fields}>
              <NumberInput
                label='Długość (mm)'
                min={1}
                max={10000}
                allowDecimal={false}
                value={dims.lengthMm}
                onChange={setDim('lengthMm')}
                error={err('parcel.lengthMm') ?? err('parcel')}
                required
              />
              <NumberInput
                label='Szerokość (mm)'
                min={1}
                max={10000}
                allowDecimal={false}
                value={dims.widthMm}
                onChange={setDim('widthMm')}
                error={err('parcel.widthMm')}
                required
              />
              <NumberInput
                label='Wysokość (mm)'
                min={1}
                max={10000}
                allowDecimal={false}
                value={dims.heightMm}
                onChange={setDim('heightMm')}
                error={err('parcel.heightMm')}
                required
              />
              <NumberInput
                label='Waga (kg)'
                min={0.01}
                max={1000}
                decimalScale={2}
                decimalSeparator=','
                value={dims.weightKg}
                onChange={setDim('weightKg')}
                error={err('parcel.weightKg')}
                required
              />
            </div>
          </div>
        )}

        <div>
          <h4 className={classes.sectionTitle}>Odbiorca</h4>
          <div className={classes.fields}>
            <TextInput
              label='Firma'
              value={receiver.companyName}
              onChange={(e) => setField('companyName')(e.currentTarget.value)}
              error={err('receiver.companyName')}
            />
            <TextInput
              label='Imię'
              required
              value={receiver.firstName}
              onChange={(e) => setField('firstName')(e.currentTarget.value)}
              error={err('receiver.firstName')}
            />
            <TextInput
              label='Nazwisko'
              required
              value={receiver.lastName}
              onChange={(e) => setField('lastName')(e.currentTarget.value)}
              error={err('receiver.lastName')}
            />
            <TextInput
              label='E-mail'
              type='email'
              required
              value={receiver.email}
              onChange={(e) => setField('email')(e.currentTarget.value)}
              error={err('receiver.email')}
            />
            <TextInput
              label='Telefon'
              type='tel'
              required
              description='9 cyfr'
              value={receiver.phone}
              onChange={(e) => setField('phone')(e.currentTarget.value)}
              error={err('receiver.phone')}
            />
          </div>
          <div
            className={classes.fields}
            style={{ marginTop: 'var(--cdm-space-sm)' }}
          >
            <TextInput
              label='Ulica'
              required={kind === 'courier'}
              value={receiver.street}
              onChange={(e) => setField('street')(e.currentTarget.value)}
              error={err('receiver.street')}
            />
            <TextInput
              label='Nr budynku / lokalu'
              required={kind === 'courier'}
              value={receiver.buildingNumber}
              onChange={(e) =>
                setField('buildingNumber')(e.currentTarget.value)
              }
              error={err('receiver.buildingNumber')}
            />
            <TextInput
              label='Kod pocztowy'
              placeholder='00-000'
              required={kind === 'courier'}
              value={receiver.postCode}
              onChange={(e) => setField('postCode')(e.currentTarget.value)}
              error={err('receiver.postCode')}
            />
            <TextInput
              label='Miejscowość'
              required={kind === 'courier'}
              value={receiver.city}
              onChange={(e) => setField('city')(e.currentTarget.value)}
              error={err('receiver.city')}
            />
          </div>
          {kind === 'locker' ? (
            <Text size='xs' c='cdmInk.6' mt={4}>
              Dla Paczkomatu adres jest opcjonalny — InPost potrzebuje imienia,
              nazwiska, e-maila i telefonu odbiorcy.
            </Text>
          ) : null}
        </div>

        {create.isError ? (
          <Alert
            color='red'
            variant='light'
            title='InPost nie utworzył przesyłki'
            withCloseButton
            onClose={() => create.reset()}
          >
            {shipmentErrorText(create.error)} Zamówienie pozostało bez zmian.
          </Alert>
        ) : null}

        <Group>
          <Button
            type='button'
            color='cdmInk'
            loading={create.isPending}
            onClick={submit}
            leftSection={
              kind === 'courier' ? (
                <Truck size={16} aria-hidden />
              ) : (
                <Package size={16} aria-hidden />
              )
            }
          >
            Utwórz przesyłkę
          </Button>
          {create.isPending ? (
            <Text size='sm' c='cdmInk.6'>
              Czekamy na numer przesyłki z InPost (do 10 s)…
            </Text>
          ) : null}
        </Group>
      </Stack>
    </div>
  );
}

/** Admin order page block: shipments of the order + a new shipment form. */
export function ShippingPanel({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  const shipping = useOrderShipping(orderId);

  return (
    <section className={classes.panel} aria-label='Wysyłka InPost'>
      <h2 className={classes.panelTitle}>Wysyłka InPost</h2>
      {shipping.isPending ? (
        <Loader size='sm' />
      ) : shipping.isError ? (
        <Alert
          color='red'
          variant='light'
          title='Nie udało się pobrać danych wysyłki'
        >
          {shipmentErrorText(shipping.error)}{' '}
          <Button
            size='xs'
            variant='subtle'
            color='red'
            onClick={() => void shipping.refetch()}
          >
            Spróbuj ponownie
          </Button>
        </Alert>
      ) : (
        <>
          <ShipmentsTable
            orderId={orderId}
            shipments={shipping.data.shipments}
          />
          <div className={classes.section}>
            <h3 className={classes.sectionTitle}>
              {shipping.data.shipments.length > 0
                ? 'Kolejna przesyłka'
                : 'Nowa przesyłka'}
            </h3>
            <NewShipmentForm
              key={orderId}
              orderId={orderId}
              orderNumber={orderNumber}
              info={shipping.data}
            />
          </div>
        </>
      )}
    </section>
  );
}
