import type { ProductCard } from '@catalog/shared/schemas/product';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';

import { apiErrorMessage } from '@/lib/http';

import { useAddToCart } from './api';
import classes from './Catalog.module.css';
import { PriceBlock } from './PriceBlock';
import { ProductImage } from './ProductImage';
import { StockInfo } from './StockInfo';
import type { CatalogView } from './useCatalogParams';

interface ProductTileProps {
  product: ProductCard;
  discountPercent: number;
  /** 'grid' = card (default), 'list' = one compact row. */
  view?: CatalogView;
}

// "Do koszyka" straight from the list adds 1 piece. A product with versions
// needs a choice first, so its button opens the product page instead.
function TileCartButton({ product }: { product: ProductCard }) {
  const addToCart = useAddToCart();
  const href = `/produkt/${encodeURIComponent(product.sku)}`;

  if (product.hasVariants) {
    return (
      <Button
        component={Link}
        to={href}
        variant='default'
        size='xs'
        fullWidth
        className={classes.tileAction}
      >
        Wybierz wersję
      </Button>
    );
  }

  return (
    <Button
      size='xs'
      fullWidth
      className={classes.tileAction}
      leftSection={<ShoppingCart size={16} aria-hidden />}
      loading={addToCart.isPending}
      aria-label={`Dodaj do koszyka: ${product.name}`}
      onClick={() =>
        addToCart.mutate(
          { sku: product.sku, variant: null, qty: 1 },
          {
            onSuccess: () =>
              notifications.show({
                color: 'green',
                title: 'Dodano do koszyka',
                message: `${product.name} × 1`,
              }),
            onError: (err) =>
              notifications.show({
                color: 'red',
                title: 'Nie dodano do koszyka',
                message: apiErrorMessage(err),
                autoClose: 8000,
              }),
          },
        )
      }
    >
      Do koszyka
    </Button>
  );
}

// One product of the catalogue: a card in the grid, a compact row in the list.
// The product name is a stretched link, so the whole card or row still opens
// the product page; the cart button sits above it. The discount ('Rabat -X%' and
// the old price struck out) is part of the price block, the same in both views.
export function ProductTile({
  product,
  discountPercent,
  view = 'grid',
}: ProductTileProps) {
  const deposit = product.price?.unitDeposit ?? 0;
  const isList = view === 'list';
  return (
    <article
      className={isList ? `${classes.card} ${classes.cardList}` : classes.card}
    >
      <ProductImage src={product.imageUrl} alt={product.name} />
      <div className={classes.cardBody}>
        <div className={classes.info}>
          {product.producer ? (
            <p className={`cdm-eyebrow ${classes.eyebrow}`}>
              {product.producer}
            </p>
          ) : null}
          <h2 className={classes.name}>
            <Link
              to={`/produkt/${encodeURIComponent(product.sku)}`}
              className={classes.cardLink}
            >
              {product.name}
            </Link>
          </h2>
          <span className={classes.sku}>SKU {product.sku}</span>
          <StockInfo
            stock={product.stock}
            leadTimeHours={product.leadTimeHours}
          />
        </div>
        <div className={classes.priceArea}>
          {product.hasVariants ? (
            <div className={classes.small}>Wersje: oryginalne / zamienne</div>
          ) : null}
          <PriceBlock
            price={product.price}
            deposit={deposit}
            discountPercent={discountPercent}
          />
          <TileCartButton product={product} />
        </div>
      </div>
    </article>
  );
}
