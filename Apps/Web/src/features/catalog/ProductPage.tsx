import { Alert, Anchor, Button, Skeleton, Title } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { PageTitle } from '@/components/PageTitle';
import { apiErrorMessage, parseApiError } from '@/lib/http';

import { useProduct } from './api';
import { BuyBox } from './BuyBox';
import classes from './Catalog.module.css';
import { ProductImage } from './ProductImage';
import { ApplicationsTable, AttributesList, OeNumbers } from './ProductSpecs';

function BackLink() {
  return (
    <Anchor
      component={Link}
      to='/'
      underline='hover'
      size='sm'
      mb='md'
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      <ArrowLeft size={16} aria-hidden /> Wróć do katalogu
    </Anchor>
  );
}

// R-17 — product page (behind login): photo, OE numbers, applications,
// attributes, variant choice, price for the user's discount, add to cart.
export function ProductPage() {
  const { sku = '' } = useParams();
  const { data: product, isPending, isError, error, refetch } = useProduct(sku);

  if (isPending) {
    return (
      <div aria-busy='true'>
        <BackLink />
        <div className={classes.productLayout}>
          <Skeleton className={classes.media} />
          <div>
            <Skeleton height={12} width='30%' />
            <Skeleton height={36} mt='sm' />
            <Skeleton height={160} mt='lg' />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    const notFound = parseApiError(error).status === 404;
    return (
      <div>
        <BackLink />
        <Title order={1} mb='md'>
          {notFound
            ? 'Nie znaleziono produktu'
            : 'Nie udało się wczytać produktu'}
        </Title>
        <Alert color='gray'>
          {notFound
            ? `Produkt o SKU ${sku} nie istnieje albo nie jest już dostępny w katalogu.`
            : apiErrorMessage(error)}
          {notFound ? null : (
            <Button
              variant='subtle'
              size='compact-sm'
              ml='xs'
              onClick={() => refetch()}
            >
              Spróbuj ponownie
            </Button>
          )}
        </Alert>
      </div>
    );
  }

  const eyebrow = [product.producer, product.category]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <BackLink />
      <div className={classes.productLayout}>
        <div className={classes.gallery}>
          <ProductImage src={product.imageUrl} alt={product.name} eager />
        </div>
        <div>
          <PageTitle eyebrow={eyebrow || undefined} title={product.name} />
          <p className={classes.sku}>SKU {product.sku}</p>
          <BuyBox key={product.sku} product={product} />
          {product.description ? (
            <p className={classes.section}>{product.description}</p>
          ) : null}
        </div>
      </div>
      <OeNumbers numbers={product.oeNumbers} />
      <ApplicationsTable
        applications={product.applications}
        engineCodes={product.engineCodes}
      />
      <AttributesList attributes={product.attributes} />
    </div>
  );
}
