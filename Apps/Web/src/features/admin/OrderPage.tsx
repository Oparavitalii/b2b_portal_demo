import { Alert } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { parseApiError } from '@/lib/http';

import { ErrorState, LoadingState } from '../orders/LoadState';
import { OrderView } from '../orders/OrderDetailPage';
import orderClasses from '../orders/Orders.module.css';
import { AdminNav } from './AdminNav';
import { useAdminOrder } from './api';
import { ShippingPanel } from './ShippingPanel';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function OrderBody({ id }: { id: string }) {
  const valid = UUID_RE.test(id);
  const order = useAdminOrder(valid ? id : '');

  if (!valid || (order.isError && parseApiError(order.error).status === 404)) {
    return (
      <Alert color='gray' variant='light' role='alert'>
        Nie znaleziono takiego zamówienia.
      </Alert>
    );
  }
  if (order.isPending) return <LoadingState />;
  if (order.isError) {
    return (
      <ErrorState error={order.error} onRetry={() => void order.refetch()} />
    );
  }
  return (
    <>
      <OrderView order={order.data} />
      <ShippingPanel orderId={order.data.id} orderNumber={order.data.number} />
    </>
  );
}

// /admin/zamowienia/:id — one received order in full (same view the customer sees)
// plus the InPost shipping panel (B-22).
export function OrderPage() {
  const { id = '' } = useParams();

  return (
    <div>
      <AdminNav />
      <Link to='/admin/zamowienia' className={orderClasses.back}>
        <ArrowLeft size={16} aria-hidden />
        Wszystkie zamówienia
      </Link>
      <OrderBody id={id} />
    </div>
  );
}
