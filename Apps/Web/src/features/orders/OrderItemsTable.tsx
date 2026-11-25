import type { OrderItem } from '@catalog/shared/schemas/order';
import { Table, Text } from '@mantine/core';

import { formatPercent, formatPLN } from '@/lib/format';

import { PRICE_ON_REQUEST, variantLabel } from './labels';
import classes from './Orders.module.css';

// Items of a sent order: unit net / gross, kaucja, line net / gross.
// showDiscount: per-product rabaty applied, so each line shows its own %.
export function OrderItemsTable({
  items,
  showDiscount = false,
}: {
  items: OrderItem[];
  showDiscount?: boolean;
}) {
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table verticalSpacing='sm' striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Produkt</Table.Th>
            <Table.Th className={classes.num}>Ilość</Table.Th>
            <Table.Th className={classes.num}>Cena netto</Table.Th>
            <Table.Th className={classes.num}>Cena brutto</Table.Th>
            <Table.Th className={classes.num}>Kaucja</Table.Th>
            <Table.Th className={classes.num}>Wartość netto</Table.Th>
            <Table.Th className={classes.num}>Wartość brutto</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => {
            const variant = variantLabel(item.variant);
            return (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Text size='sm' fw={600}>
                    {item.name}
                  </Text>
                  <div className={classes.muted}>
                    SKU: {item.sku}
                    {variant ? ` · Wersja: ${variant}` : ''}
                    {showDiscount
                      ? ` · Rabat ${formatPercent(item.discountPercent)}`
                      : ''}
                  </div>
                </Table.Td>
                <Table.Td className={classes.num}>{item.qty} szt.</Table.Td>
                {item.priceOnRequest ? (
                  <Table.Td className={classes.num} colSpan={2}>
                    {PRICE_ON_REQUEST}
                  </Table.Td>
                ) : (
                  <>
                    <Table.Td className={classes.num}>
                      {formatPLN(item.unitNet ?? 0)}
                    </Table.Td>
                    <Table.Td className={classes.num}>
                      {formatPLN(item.unitGross ?? 0)}
                    </Table.Td>
                  </>
                )}
                <Table.Td className={classes.num}>
                  {formatPLN(item.unitDeposit)}
                </Table.Td>
                {item.priceOnRequest ? (
                  <Table.Td className={classes.num} colSpan={2}>
                    <span className={classes.muted}>nie wliczono do sum</span>
                  </Table.Td>
                ) : (
                  <>
                    <Table.Td className={classes.num}>
                      {formatPLN(item.lineNet ?? 0)}
                    </Table.Td>
                    <Table.Td className={classes.num}>
                      <strong>{formatPLN(item.lineGross ?? 0)}</strong>
                    </Table.Td>
                  </>
                )}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
