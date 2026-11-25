import { Badge, type MantineSize } from '@mantine/core';

import { formatPercent } from '@/lib/format';

// 'Rabat -X%' — dark ink badge (not red: red is reserved for the CTA).
// perProduct: the customer has per-product rabaty, so one % would mislead.
export function DiscountBadge({
  percent,
  perProduct = false,
  className,
  size,
}: {
  percent: number;
  perProduct?: boolean;
  className?: string;
  size?: MantineSize;
}) {
  if (perProduct) {
    return (
      <Badge color='cdmInk.9' radius='sm' size={size} className={className}>
        Rabaty indywidualne
      </Badge>
    );
  }
  if (percent <= 0) return null;
  return (
    <Badge color='cdmInk.9' radius='sm' size={size} className={className}>
      Rabat -{formatPercent(percent)}
    </Badge>
  );
}
