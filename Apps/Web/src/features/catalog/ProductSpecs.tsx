import type { ProductDetail } from '@catalog/shared/schemas/product';
import { Table, Title } from '@mantine/core';
import { Fragment } from 'react';

import classes from './Catalog.module.css';

const ATTRIBUTE_LABELS: Record<string, string> = {
  typ: 'Typ',
  stan: 'Stan',
  gwarancja: 'Gwarancja',
  segment: 'Segment',
  rodzina: 'Rodzina',
  waga: 'Waga',
  wymiary: 'Wymiary',
  wymienioneCzesci: 'Wymienione części',
  infoDodatkowe: 'Informacje dodatkowe',
  stanMagazynowy: 'Stan magazynowy',
};

// Shown above, next to the price, with the delivery time (StockInfo, B-19).
const HIDDEN_ATTRIBUTES = new Set(['stanMagazynowy']);

function labelFor(key: string): string {
  const known = ATTRIBUTE_LABELS[key];
  if (known) return known;
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (Array.isArray(value))
    return value.map(valueText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${labelFor(k)}: ${valueText(v)}`)
      .join(', ');
  }
  return '';
}

export function AttributesList({
  attributes,
}: {
  attributes: ProductDetail['attributes'];
}) {
  const rows = Object.entries(attributes)
    .filter(([key]) => !HIDDEN_ATTRIBUTES.has(key))
    .map(([key, value]) => ({
      key,
      label: labelFor(key),
      text: valueText(value),
    }))
    .filter((row) => row.text !== '');
  if (rows.length === 0) return null;
  return (
    <section className={classes.section}>
      <Title order={2} size='h4' mb='sm'>
        Parametry
      </Title>
      <dl className={classes.attrs}>
        {rows.map((row) => (
          <Fragment key={row.key}>
            <dt>{row.label}</dt>
            <dd>{row.text}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

export function OeNumbers({ numbers }: { numbers: string[] }) {
  if (numbers.length === 0) return null;
  return (
    <section className={classes.section}>
      <Title order={2} size='h4' mb='sm'>
        Numery OE
      </Title>
      <ul className={classes.oeList}>
        {numbers.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </section>
  );
}

export function ApplicationsTable({
  applications,
  engineCodes,
}: {
  applications: ProductDetail['applications'];
  engineCodes: string[];
}) {
  if (applications.length === 0 && engineCodes.length === 0) return null;
  return (
    <section className={classes.section}>
      <Title order={2} size='h4' mb='sm'>
        Zastosowanie
      </Title>
      {applications.length > 0 ? (
        <div className={classes.tableWrap}>
          <Table striped withTableBorder verticalSpacing='xs' miw={520}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Marka</Table.Th>
                <Table.Th>Model</Table.Th>
                <Table.Th>Silnik</Table.Th>
                <Table.Th>Lata</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {applications.map((a, i) => (
                <Table.Tr key={`${a.marka}|${a.model}|${a.silnik}|${i}`}>
                  <Table.Td>{a.marka}</Table.Td>
                  <Table.Td>{a.model}</Table.Td>
                  <Table.Td>{a.silnik}</Table.Td>
                  <Table.Td>{a.lata}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      ) : null}
      {engineCodes.length > 0 ? (
        <p className={classes.small}>Kody silników: {engineCodes.join(', ')}</p>
      ) : null}
    </section>
  );
}
