import {
  type AdminProductDetail,
  type AdminProductOptions,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_STOCK_MAX,
  type ProductInput,
  productInputSchema,
} from '@catalog/shared/schemas/admin';
import { availability, stockDefaults } from '@catalog/shared/schemas/product';
import {
  Alert,
  Autocomplete,
  Button,
  Drawer,
  FileButton,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { serverFieldErrors, zodErrors } from '@/features/auth/form-utils';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage, parseApiError } from '@/lib/http';

import classes from './Admin.module.css';
import {
  useAdminProduct,
  useCreateProduct,
  useProductOptions,
  useRemoveProductImage,
  useUpdateProduct,
  useUploadProductImage,
} from './api';
import { ProductThumb } from './ProductThumb';
import {
  LEAD_TIME_OPTIONS,
  leadTimeFromValue,
  leadTimeToValue,
} from './StockEditor';

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
/** Stock and delivery time of a new product, by category (owner, 2026-10-12). */
const newStock = (category: string) => {
  const d = stockDefaults(category);
  return { stock: d.stock, lead: leadTimeToValue(d.leadTimeHours) };
};

interface FormValues {
  sku: string;
  name: string;
  category: string;
  producer: string;
  priceOnRequest: boolean;
  priceZl: number | string;
  depositZl: number | string;
  makes: string[];
  oeNumbers: string[];
  description: string;
  stock: number | string;
  lead: string;
  active: boolean;
}

const zl = (grosze: number | null) => (grosze === null ? '' : grosze / 100);
const grosze = (value: number | string) =>
  typeof value === 'number' ? Math.round(value * 100) : null;

function initialValues(p: AdminProductDetail | null): FormValues {
  return {
    sku: p?.sku ?? '',
    name: p?.name ?? '',
    category: p?.category ?? '',
    producer: p?.producer ?? '',
    priceOnRequest: p?.priceOnRequest ?? false,
    priceZl: zl(p?.priceGross ?? null),
    depositZl: zl(p?.depositGross ?? 0),
    makes: p?.makes ?? [],
    oeNumbers: p?.oeNumbers ?? [],
    description: p?.description ?? '',
    stock: p?.stock ?? newStock('').stock,
    lead: p ? leadTimeToValue(p.leadTimeHours) : newStock('').lead,
    active: p?.active ?? true,
  };
}

function toInput(v: FormValues): ProductInput {
  const text = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    sku: v.sku.trim(),
    name: v.name.trim(),
    category: text(v.category),
    producer: text(v.producer),
    priceOnRequest: v.priceOnRequest,
    priceGross: v.priceOnRequest ? null : grosze(v.priceZl),
    depositGross: grosze(v.depositZl) ?? 0,
    makes: v.makes,
    oeNumbers: v.oeNumbers,
    description: text(v.description),
    stock: typeof v.stock === 'number' ? v.stock : Number.NaN,
    leadTimeHours: leadTimeFromValue(v.lead),
    active: v.active,
  };
}

/** Form field ← ProductInput path (money fields are edited in złoty). */
const FIELD: Record<string, keyof FormValues> = {
  priceGross: 'priceZl',
  depositGross: 'depositZl',
  leadTimeHours: 'lead',
};

function mapErrors(errors: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    const field = FIELD[key.split('.')[0] ?? key] ?? key.split('.')[0] ?? key;
    if (!(field in out)) out[field] = message;
  }
  return out;
}

function PhotoField({
  product,
  pending,
  onPick,
}: {
  product: AdminProductDetail | null;
  pending: File | null;
  onPick: (file: File | null) => void;
}) {
  const upload = useUploadProductImage();
  const remove = useRemoveProductImage();
  const [preview, setPreview] = useState<string | null>(null);

  function pick(file: File | null) {
    if (!file) return;
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      notifications.show({
        color: 'red',
        message: 'Zdjęcie: maksymalnie 5 MB.',
      });
      return;
    }
    if (!product) {
      // New product: the photo goes up right after the product is created.
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      onPick(file);
      return;
    }
    upload.mutate(
      { sku: product.sku, file },
      {
        onSuccess: () =>
          notifications.show({ color: 'green', message: 'Zdjęcie zapisane.' }),
        onError: (err) =>
          notifications.show({
            color: 'red',
            message:
              parseApiError(err).code === 'invalid_image'
                ? 'Dozwolone formaty: JPG, PNG, WebP.'
                : apiErrorMessage(err),
          }),
      },
    );
  }

  const src = product ? product.imageUrl : pending ? preview : null;
  return (
    <div>
      <Text size='sm' fw={500} mb={4}>
        Zdjęcie
      </Text>
      <Group gap='sm' align='center'>
        <ProductThumb src={src} alt={product?.name ?? 'Nowe zdjęcie'} />
        <FileButton onChange={pick} accept={IMAGE_TYPES}>
          {(props) => (
            <Button
              {...props}
              variant='default'
              size='sm'
              leftSection={<ImagePlus size={16} aria-hidden />}
              loading={upload.isPending}
            >
              {src ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}
            </Button>
          )}
        </FileButton>
        {product?.image ? (
          <Button
            variant='subtle'
            color='red'
            size='sm'
            leftSection={<Trash2 size={16} aria-hidden />}
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(product.sku, {
                onError: (err) =>
                  notifications.show({
                    color: 'red',
                    message: apiErrorMessage(err),
                  }),
              })
            }
          >
            Usuń zdjęcie
          </Button>
        ) : null}
      </Group>
      <Text size='xs' className={classes.muted} mt={4}>
        JPG, PNG lub WebP, do 5 MB.
        {product
          ? ' Zapisuje się od razu.'
          : ' Wyśle się po zapisaniu produktu.'}
      </Text>
    </div>
  );
}

function ProductForm({
  product,
  options,
  onDone,
}: {
  product: AdminProductDetail | null;
  options: AdminProductOptions | undefined;
  onDone: () => void;
}) {
  const isNew = product === null;
  const form = useForm<FormValues>({
    initialValues: initialValues(product),
    validate: (values) =>
      mapErrors(zodErrors(productInputSchema, toInput(values))),
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const upload = useUploadProductImage();
  const saving = create.isPending || update.isPending || upload.isPending;

  function onError(err: unknown) {
    const info = parseApiError(err);
    if (info.code === 'sku_taken') {
      form.setFieldError('sku', 'Produkt z tym SKU już istnieje.');
      return;
    }
    if (info.code === 'sku_reserved') {
      form.setFieldError('sku', 'Ten SKU jest zarezerwowany — wybierz inny.');
      return;
    }
    if (info.code === 'price_required') {
      form.setFieldError(
        'priceZl',
        'Podaj cenę albo zaznacz „Cena na zapytanie”',
      );
      return;
    }
    if (info.code === 'invalid_lead_time') {
      form.setFieldError('lead', 'Czas wysyłki: 24, 48 albo 72 h.');
      return;
    }
    const fields = serverFieldErrors(err);
    if (fields && Object.keys(fields).length > 0) {
      form.setErrors(mapErrors(fields));
      return;
    }
    notifications.show({ color: 'red', message: apiErrorMessage(err) });
  }

  function submit(values: FormValues) {
    const input = toInput(values);
    if (isNew) {
      create.mutate(input, {
        onSuccess: (saved) => {
          const done = () => {
            notifications.show({
              color: 'green',
              message: `Dodano produkt ${saved.sku}.`,
            });
            onDone();
          };
          if (!photo) return done();
          upload.mutate(
            { sku: saved.sku, file: photo },
            {
              onSuccess: done,
              onError: (err) => {
                notifications.show({
                  color: 'red',
                  message: `Produkt dodany, ale zdjęcie nie: ${apiErrorMessage(err)}`,
                });
                onDone();
              },
            },
          );
        },
        onError,
      });
      return;
    }
    const { sku: _sku, ...patch } = input;
    update.mutate(
      { sku: product.sku, patch },
      {
        onSuccess: (saved) => {
          notifications.show({
            color: 'green',
            message: `Zapisano produkt ${saved.sku}.`,
          });
          onDone();
        },
        onError,
      },
    );
  }

  const v = form.values;
  const categoryProps = form.getInputProps('category');
  // New product: the category brings its default stock and time, unless the admin changed them.
  function onCategory(category: string) {
    const before = newStock(v.category);
    categoryProps.onChange(category);
    if (isNew && v.stock === before.stock && v.lead === before.lead) {
      form.setValues(newStock(category));
    }
  }
  const shown = availability(
    typeof v.stock === 'number' ? v.stock : 0,
    1,
    leadTimeFromValue(v.lead),
  );

  return (
    <form onSubmit={form.onSubmit(submit)} noValidate>
      <Stack gap='sm'>
        {product?.source === 'import' ? (
          <Alert color='blue' variant='light'>
            Produkt z pliku Products_Data.json: kolejny import nadpisze nazwę,
            ceny, marki, numery OE i opis. Stan, czas wysyłki, ukrycie i zdjęcie
            dodane tutaj zostaną.
          </Alert>
        ) : null}
        <TextInput
          label='SKU'
          required
          disabled={!isNew}
          description={isNew ? 'Nie można go później zmienić.' : undefined}
          {...form.getInputProps('sku')}
        />
        <TextInput label='Nazwa' required {...form.getInputProps('name')} />
        <Group grow align='start'>
          <Autocomplete
            label='Kategoria'
            data={options?.categories ?? []}
            {...categoryProps}
            onChange={onCategory}
          />
          <Autocomplete
            label='Producent'
            data={options?.producers ?? []}
            {...form.getInputProps('producer')}
          />
        </Group>

        <Switch
          label='Cena na zapytanie'
          {...form.getInputProps('priceOnRequest', { type: 'checkbox' })}
        />
        <Group grow align='start'>
          <NumberInput
            label='Cena brutto (zł)'
            disabled={v.priceOnRequest}
            min={0}
            decimalScale={2}
            decimalSeparator=','
            thousandSeparator=' '
            allowNegative={false}
            {...form.getInputProps('priceZl')}
          />
          <NumberInput
            label='Kaucja brutto (zł)'
            min={0}
            decimalScale={2}
            decimalSeparator=','
            thousandSeparator=' '
            allowNegative={false}
            {...form.getInputProps('depositZl')}
          />
        </Group>
        {product?.hasVariants ? (
          <Text size='xs' className={classes.muted}>
            Ceny wersji „oryginalne” i „zamienne” pochodzą z importu.
          </Text>
        ) : null}

        <Group grow align='start'>
          <NumberInput
            label='Stan magazynowy (szt.)'
            min={0}
            max={PRODUCT_STOCK_MAX}
            allowDecimal={false}
            allowNegative={false}
            {...form.getInputProps('stock')}
          />
          <div>
            <Text size='sm' fw={500} mb={4} id='lead-label'>
              Orientacyjny czas wysyłki
            </Text>
            <SegmentedControl
              aria-labelledby='lead-label'
              fullWidth
              data={LEAD_TIME_OPTIONS}
              {...form.getInputProps('lead')}
            />
            {form.errors.lead ? (
              <Text size='xs' c='red' mt={4}>
                {form.errors.lead}
              </Text>
            ) : null}
          </div>
        </Group>
        <Text size='xs' className={classes.muted}>
          Auto: na stanie → 24 h, brak → 72 h. Klient zobaczy: {shown.label} ·{' '}
          {shown.leadTimeText}. Zamówienie nie zmniejsza stanu.
        </Text>

        <TagsInput
          label='Marki pojazdów'
          description='Wpisz i naciśnij Enter.'
          data={options?.makes ?? []}
          clearable
          {...form.getInputProps('makes')}
        />
        <TagsInput
          label='Numery OE'
          description='Wpisz i naciśnij Enter; wyszukiwarka znajdzie produkt po każdym z nich.'
          clearable
          {...form.getInputProps('oeNumbers')}
        />
        <Textarea
          label='Opis'
          autosize
          minRows={3}
          maxRows={10}
          {...form.getInputProps('description')}
        />
        <PhotoField product={product} pending={photo} onPick={setPhoto} />
        <Switch
          label='Widoczny w katalogu'
          {...form.getInputProps('active', { type: 'checkbox' })}
        />

        {product ? (
          <Text size='xs' className={classes.muted}>
            {product.source === 'manual' ? 'Dodany ręcznie' : 'Z importu'} ·{' '}
            {formatDateTime(product.importedAt)}
            {product.updatedAt
              ? ` · ostatnia zmiana ${formatDateTime(product.updatedAt)}`
              : ''}
          </Text>
        ) : null}

        <Group justify='flex-end' mt='sm'>
          <Button variant='default' onClick={onDone} disabled={saving}>
            Anuluj
          </Button>
          <Button type='submit' color='cdmInk' loading={saving}>
            {isNew ? 'Dodaj produkt' : 'Zapisz zmiany'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

interface ProductEditorProps {
  /** null = closed, '' = new product, otherwise the SKU being edited. */
  sku: string | null;
  onClose: () => void;
}

// Admin: edit a product or add one by hand (Pilot_Run 2026-10-10).
export function ProductEditor({ sku, onClose }: ProductEditorProps) {
  // D-03: the drawer animates out after sku turns null — keep the last SKU so
  // the title does not flash as „Edycja: ”.
  const [lastSku, setLastSku] = useState(sku);
  if (sku !== null && sku !== lastSku) setLastSku(sku);
  const titleSku = sku ?? lastSku;
  const isNew = sku === '';
  const product = useAdminProduct(isNew ? null : sku);
  const options = useProductOptions();

  return (
    <Drawer
      opened={sku !== null}
      onClose={onClose}
      position='right'
      size='lg'
      title={titleSku === '' ? 'Nowy produkt' : `Edycja: ${titleSku ?? ''}`}
    >
      {isNew ? (
        <ProductForm product={null} options={options.data} onDone={onClose} />
      ) : product.isError ? (
        <Alert color='red' title='Nie udało się pobrać produktu'>
          {apiErrorMessage(product.error)}
        </Alert>
      ) : !product.data ? (
        <Loader />
      ) : (
        <ProductForm
          key={product.data.sku}
          product={product.data}
          options={options.data}
          onDone={onClose}
        />
      )}
    </Drawer>
  );
}
