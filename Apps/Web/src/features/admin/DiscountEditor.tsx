import {
  DISCOUNT_STEP,
  updateDiscountSchema,
} from '@catalog/shared/schemas/admin';
import { Button, NumberInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { apiErrorMessage, parseApiError } from '@/lib/http';
import { formatPercent } from '@/lib/format';

import classes from './Admin.module.css';
import { useUpdateDiscount } from './api';

interface DiscountEditorProps {
  customerId: string;
  companyLabel: string;
  value: number;
}

// R-02: one % on the whole catalogue, 0–100 in steps of 0.5, saved per row.
export function DiscountEditor({
  customerId,
  companyLabel,
  value,
}: DiscountEditorProps) {
  const [draft, setDraft] = useState<number | string>(value);
  const [synced, setSynced] = useState(value);
  const update = useUpdateDiscount();

  // The server value changed (save here or elsewhere): show it.
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }

  const parsed = updateDiscountSchema.safeParse({
    discountPercent: typeof draft === 'number' ? draft : Number.NaN,
  });
  const error =
    draft === '' || typeof draft !== 'number'
      ? 'Podaj rabat'
      : parsed.success
        ? null
        : (parsed.error.issues[0]?.message ?? 'Nieprawidłowy rabat');
  const dirty = typeof draft === 'number' && draft !== value;

  function save() {
    if (!parsed.success) return;
    update.mutate(
      { id: customerId, discountPercent: parsed.data.discountPercent },
      {
        onSuccess: (customer) =>
          notifications.show({
            color: 'green',
            message: `Rabat dla ${companyLabel}: ${formatPercent(customer.discountPercent)}`,
          }),
        onError: (err) =>
          notifications.show({
            color: 'red',
            message:
              parseApiError(err).code === 'invalid_discount'
                ? 'Rabat: od 0 do 100%, co 0,5 punktu procentowego.'
                : apiErrorMessage(err),
          }),
      },
    );
  }

  return (
    <div className={classes.discountCell}>
      <NumberInput
        aria-label={`Rabat (%) dla: ${companyLabel}`}
        value={draft}
        onChange={setDraft}
        min={0}
        max={100}
        step={DISCOUNT_STEP}
        decimalScale={1}
        decimalSeparator=','
        suffix=' %'
        clampBehavior='strict'
        allowNegative={false}
        error={error}
        w={110}
        size='sm'
        onKeyDown={(e) => {
          if (e.key === 'Enter' && dirty && !error) save();
        }}
      />
      <Button
        size='sm'
        variant={dirty ? 'filled' : 'default'}
        color='cdmInk'
        disabled={!dirty || error !== null}
        loading={update.isPending}
        onClick={save}
      >
        Zapisz
      </Button>
    </div>
  );
}
