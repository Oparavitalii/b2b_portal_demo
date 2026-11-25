import { availability } from '@catalog/shared/schemas/product';
import { Truck } from 'lucide-react';

import classes from './Catalog.module.css';

interface StockInfoProps {
  stock: number | null;
  /** Pieces the client wants; more than in stock → production, 72 h. */
  qty?: number;
  /** The admin's 24 / 48 / 72 h; null = automatic from stock. */
  leadTimeHours?: number | null;
}

// "W magazynie: 10 szt. · Wysyłka w 24 h" or "W produkcji · Wysyłka w 72 h" (B-19).
// Display only: stock and delivery time are set in the admin panel; orders never lower stock.
export function StockInfo({ stock, qty = 1, leadTimeHours = null }: StockInfoProps) {
  const a = availability(stock, qty, leadTimeHours);
  return (
    <div className={classes.stock}>
      <p className={classes.stockLine}>
        <span
          className={a.inStock ? classes.stockDotOk : classes.stockDotWait}
          aria-hidden
        />
        <span>{a.label}</span>
        <span className={classes.stockSep} aria-hidden>
          ·
        </span>
        <span className={classes.stockLead}>
          <Truck size={14} aria-hidden className={classes.stockIcon} />
          {a.leadTimeText}
        </span>
      </p>
    </div>
  );
}
