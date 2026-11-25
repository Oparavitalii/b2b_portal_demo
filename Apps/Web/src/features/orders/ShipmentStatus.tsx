import {
  type CustomerShipment,
  type ShipmentEvent,
  SHIPMENT_STAGES,
  shipmentStage,
} from '@catalog/shared/schemas/shipment';
import { Anchor, Badge, Group, Stack, Text } from '@mantine/core';
import { ExternalLink, Package, Truck } from 'lucide-react';

import { formatDateTime } from '@/lib/format';

// InPost shipment status (B-22: R-02, R-03) — used by the customer's
// „Moje zamówienia” and by the admin order pages. Admin `Shipment` objects
// fit too (they carry every CustomerShipment field).

type ShipmentLike = Pick<
  CustomerShipment,
  'status' | 'statusLabel' | 'trackingNumber' | 'trackingUrl'
>;

/** Stage badge (colour) with the exact InPost status as its title. */
export function ShipmentBadge({
  shipment,
}: {
  shipment: Pick<CustomerShipment, 'status' | 'statusLabel'>;
}) {
  const stage = SHIPMENT_STAGES[shipmentStage(shipment.status)];
  return (
    <Badge
      color={stage.color}
      variant='light'
      title={shipment.statusLabel}
      style={{ textTransform: 'none' }}
    >
      {stage.label}
    </Badge>
  );
}

/** Tracking number linked to inpost.pl tracking (opens in a new tab). */
export function TrackingLink({ shipment }: { shipment: ShipmentLike }) {
  if (!shipment.trackingNumber) {
    return (
      <Text size='sm' c='cdmInk.6'>
        Numer przesyłki w przygotowaniu
      </Text>
    );
  }
  if (!shipment.trackingUrl) {
    return (
      <Text size='sm' ff='monospace'>
        {shipment.trackingNumber}
      </Text>
    );
  }
  return (
    <Anchor
      href={shipment.trackingUrl}
      target='_blank'
      rel='noopener noreferrer'
      size='sm'
      ff='monospace'
      aria-label={`Śledź przesyłkę ${shipment.trackingNumber} na inpost.pl`}
    >
      <Group gap={4} wrap='nowrap' component='span'>
        {shipment.trackingNumber}
        <ExternalLink size={14} aria-hidden />
      </Group>
    </Anchor>
  );
}

/** Compact cell for order lists: badge + tracking link, or a dash. */
export function ShipmentCell({
  shipment,
}: {
  shipment: ShipmentLike | null | undefined;
}) {
  if (!shipment) {
    return (
      <Text size='sm' c='cdmInk.6'>
        —
      </Text>
    );
  }
  return (
    <Stack gap={2} align='flex-start'>
      <ShipmentBadge shipment={shipment} />
      {shipment.trackingNumber ? <TrackingLink shipment={shipment} /> : null}
    </Stack>
  );
}

/** Status history, newest first. */
export function ShipmentHistory({ events }: { events: ShipmentEvent[] }) {
  if (events.length === 0) return null;
  return (
    <Stack component='ol' gap={4} m={0} p={0} style={{ listStyle: 'none' }}>
      {events.map((e, i) => (
        <Group
          component='li'
          key={`${e.status}-${e.at}-${i}`}
          gap='xs'
          wrap='nowrap'
          align='baseline'
        >
          <Text size='xs' c='cdmInk.6' style={{ whiteSpace: 'nowrap' }}>
            {formatDateTime(e.at)}
          </Text>
          <Text size='sm' fw={i === 0 ? 600 : 400}>
            {e.statusLabel}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

/** Full block for one shipment: kind, badge, status, tracking, target point, history. */
export function ShipmentStatus({ shipment }: { shipment: CustomerShipment }) {
  const Icon = shipment.kind === 'courier' ? Truck : Package;
  return (
    <Stack gap='xs'>
      <Group gap='xs' wrap='wrap'>
        <Icon size={18} aria-hidden />
        <Text size='sm' fw={600}>
          {shipment.kind === 'courier' ? 'Kurier InPost' : 'Paczkomat InPost'}
        </Text>
        <ShipmentBadge shipment={shipment} />
      </Group>
      <Text size='sm'>{shipment.statusLabel}</Text>
      <TrackingLink shipment={shipment} />
      {shipment.targetPoint ? (
        <Text size='sm' c='cdmInk.7'>
          Paczkomat {shipment.targetPoint}
          {shipment.targetPointInfo
            ? `, ${shipment.targetPointInfo.line1}, ${shipment.targetPointInfo.line2}`
            : ''}
          {shipment.targetPointInfo?.description
            ? ` (${shipment.targetPointInfo.description})`
            : ''}
        </Text>
      ) : null}
      <ShipmentHistory events={shipment.events} />
    </Stack>
  );
}
