import {
  type AdminProduct,
  PRODUCT_STOCK_MAX,
} from '@catalog/shared/schemas/admin';
import {
  availability,
  type LeadTimeHours,
} from '@catalog/shared/schemas/product';
import { Button, NumberInput, Select, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { apiErrorMessage } from '@/lib/http';

import classes from './Admin.module.css';
import { useUpdateProduct } from './api';

export const LEAD_TIME_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '24', label: '24 h' },
  { value: '48', label: '48 h' },
  { value: '72', label: '72 h' },
];

export function leadTimeFromValue(value: string | null): LeadTimeHours | null {
  return value === '24' || value === '48' || value === '72'
    ? (Number(value) as LeadTimeHours)
    : null;
}

export const leadTimeToValue = (h: number | null) =>
  h === null ? 'auto' : String(h);

// Stan magazynowy + czas wysyłki (two columns), saved per row from the product table.
// Display only: orders never lower stock (B-19).
export function StockEditor({ product }: { product: AdminProduct }) {
  const [stock, setStock] = useState<number | string>(product.stock);
  const [lead, setLead] = useState(leadTimeToValue(product.leadTimeHours));
  const server = `${product.stock}|${product.leadTimeHours}`;
  const [synced, setSynced] = useState(server);
  const update = useUpdateProduct();

  // The server values changed (saved here or in the form): show them. Compared by
  // value, so a refetch of the list does not wipe what the admin is typing.
  if (synced !== server) {
    setSynced(server);
    setStock(product.stock);
    setLead(leadTimeToValue(product.leadTimeHours));
  }

  const valid =
    typeof stock === 'number' &&
    Number.isInteger(stock) &&
    stock >= 0 &&
    stock <= PRODUCT_STOCK_MAX;
  const dirty =
    stock !== product.stock || lead !== leadTimeToValue(product.leadTimeHours);
  const shown = availability(
    valid ? stock : product.stock,
    1,
    leadTimeFromValue(lead),
  );

  function save() {
    if (!valid || !dirty) return;
    update.mutate(
      {
        sku: product.sku,
        patch: { stock, leadTimeHours: leadTimeFromValue(lead) },
      },
      {
        onSuccess: (p) =>
          notifications.show({
            color: 'green',
            message: `${p.sku}: stan ${p.stock} szt., wysyłka ${p.leadTimeHours === null ? 'auto' : `${p.leadTimeHours} h`}`,
          }),
        onError: (err) =>
          notifications.show({ color: 'red', message: apiErrorMessage(err) }),
      },
    );
  }

  // Two table cells: «Stan magazynowy» and «Czas wysyłki» (with the row's Zapisz).
  return (
    <>
      <Table.Td>
        <NumberInput
          aria-label={`Stan magazynowy (szt.): ${product.sku}`}
          value={stock}
          onChange={setStock}
          min={0}
          max={PRODUCT_STOCK_MAX}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior='strict'
          suffix=' szt.'
          error={valid ? null : 'Podaj stan'}
          w={92}
          size='sm'
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
      </Table.Td>
      <Table.Td>
        <div className={classes.stockCell}>
          <Select
            aria-label={`Czas wysyłki: ${product.sku}`}
            data={LEAD_TIME_OPTIONS}
            value={lead}
            onChange={(v) => setLead(v ?? 'auto')}
            allowDeselect={false}
            w={96}
            size='sm'
            comboboxProps={{ withinPortal: true }}
          />
          <Button
            size='sm'
            variant={dirty ? 'filled' : 'default'}
            color='cdmInk'
            disabled={!dirty || !valid}
            loading={update.isPending}
            onClick={save}
          >
            Zapisz
          </Button>
          <Text size='xs' className={`${classes.muted} ${classes.stockHint}`}>
            Klient widzi: {shown.label} · {shown.leadTimeText}
          </Text>
        </div>
      </Table.Td>
    </>
  );
}
