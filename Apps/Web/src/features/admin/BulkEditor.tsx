import {
  type BulkProductInput,
  PRODUCT_PRICE_PERCENT_MAX,
  PRODUCT_PRICE_PERCENT_MIN,
  PRODUCT_STOCK_MAX,
} from '@catalog/shared/schemas/admin';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { apiErrorMessage } from '@/lib/http';

import classes from './Admin.module.css';
import { useBulkUpdateProducts } from './api';
import { LEAD_TIME_OPTIONS, leadTimeFromValue } from './StockEditor';

const KEEP = 'keep';
const PRICE_MODES = [
  { value: KEEP, label: 'Bez zmian' },
  { value: 'set', label: 'Ustaw cenę brutto' },
  { value: 'percent', label: 'Zmień o procent' },
];
const LEAD_OPTIONS = [
  { value: KEEP, label: 'Bez zmian' },
  ...LEAD_TIME_OPTIONS,
];

function BulkForm({
  skus,
  onClose,
  onDone,
}: {
  skus: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [priceMode, setPriceMode] = useState(KEEP);
  const [price, setPrice] = useState<number | string>('');
  const [stock, setStock] = useState<number | string>('');
  const [lead, setLead] = useState(KEEP);
  const update = useBulkUpdateProducts();

  const patch: Omit<BulkProductInput, 'skus'> = {};
  if (typeof price === 'number') {
    if (priceMode === 'set') patch.priceGross = Math.round(price * 100);
    if (priceMode === 'percent' && price !== 0) patch.pricePercent = price;
  }
  if (typeof stock === 'number') patch.stock = stock;
  if (lead !== KEEP) patch.leadTimeHours = leadTimeFromValue(lead);
  const priceMissing = priceMode !== KEEP && typeof price !== 'number';
  const ready = Object.keys(patch).length > 0 && !priceMissing;

  function save() {
    if (!ready) return;
    update.mutate(
      { skus, ...patch },
      {
        onSuccess: (r) => {
          const skipped =
            r.priceSkipped > 0
              ? ` Bez zmiany ceny (cena na zapytanie): ${r.priceSkipped}.`
              : '';
          notifications.show({
            color: 'green',
            message: `Zmieniono produktów: ${r.updated}.${skipped}`,
            autoClose: 8000,
          });
          onDone();
        },
        onError: (err) =>
          notifications.show({
            color: 'red',
            title: 'Nie udało się zapisać zmian',
            message: apiErrorMessage(err),
            autoClose: 8000,
          }),
      },
    );
  }

  return (
    <Stack gap='sm'>
      <Text size='sm' className={classes.muted}>
        Wypełnij tylko to, co chcesz zmienić. Puste pola i „Bez zmian”
        zostawiają obecne wartości.
      </Text>
      <Group grow align='start'>
        <Select
          label='Cena'
          data={PRICE_MODES}
          value={priceMode}
          onChange={(v) => {
            setPriceMode(v ?? KEEP);
            setPrice('');
          }}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
        {priceMode === 'percent' ? (
          <NumberInput
            label='Zmiana ceny (%)'
            description='Np. 10 = podwyżka o 10%, -5 = obniżka o 5%.'
            value={price}
            onChange={setPrice}
            min={PRODUCT_PRICE_PERCENT_MIN}
            max={PRODUCT_PRICE_PERCENT_MAX}
            decimalScale={2}
            decimalSeparator=','
            suffix=' %'
            clampBehavior='strict'
            error={priceMissing ? 'Podaj procent' : null}
          />
        ) : (
          <NumberInput
            label='Cena brutto (zł)'
            value={price}
            onChange={setPrice}
            disabled={priceMode === KEEP}
            min={0}
            decimalScale={2}
            decimalSeparator=','
            thousandSeparator=' '
            allowNegative={false}
            error={priceMissing ? 'Podaj cenę' : null}
          />
        )}
      </Group>
      {priceMode === 'set' ? (
        <Text size='xs' className={classes.muted}>
          Ta sama cena dla wszystkich zaznaczonych, także tych z ceną na
          zapytanie. Ceny wersji „oryginalne” i „zamienne” zostają.
        </Text>
      ) : null}
      {priceMode === 'percent' ? (
        <Text size='xs' className={classes.muted}>
          Zmienia też ceny wersji „oryginalne” i „zamienne”. Produkty z ceną na
          zapytanie zostają bez ceny.
        </Text>
      ) : null}
      <Group grow align='start'>
        <NumberInput
          label='Stan magazynowy (szt.)'
          placeholder='Bez zmian'
          value={stock}
          onChange={setStock}
          min={0}
          max={PRODUCT_STOCK_MAX}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior='strict'
        />
        <Select
          label='Orientacyjny czas wysyłki'
          data={LEAD_OPTIONS}
          value={lead}
          onChange={(v) => setLead(v ?? KEEP)}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>
      {priceMode !== KEEP ? (
        <Alert color='blue' variant='light'>
          Kolejny import z pliku Products_Data.json nadpisze ceny produktów z
          importu. Stan i czas wysyłki zostaną.
        </Alert>
      ) : null}
      <Group justify='flex-end' mt='sm'>
        <Button variant='default' onClick={onClose} disabled={update.isPending}>
          Anuluj
        </Button>
        <Button
          color='cdmInk'
          disabled={!ready}
          loading={update.isPending}
          onClick={save}
        >
          Zmień produkty: {skus.length}
        </Button>
      </Group>
    </Stack>
  );
}

// One change (price, stock, delivery time) for every selected product (owner, 2026-10-12).
export function BulkEditor({
  skus,
  opened,
  onClose,
  onDone,
}: {
  skus: string[];
  opened: boolean;
  onClose: () => void;
  /** Saved: the page clears the selection. */
  onDone: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Zmiana zaznaczonych produktów (${skus.length})`}
      size='lg'
    >
      {/* Mounted per opening, so the fields start empty every time. */}
      {opened ? (
        <BulkForm skus={skus} onClose={onClose} onDone={onDone} />
      ) : null}
    </Modal>
  );
}
