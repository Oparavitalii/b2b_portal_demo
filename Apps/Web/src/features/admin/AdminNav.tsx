import { Package, Percent, ReceiptText, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import classes from './Admin.module.css';

function linkClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? `${classes.navLink} ${classes.navLinkActive}`
    : (classes.navLink ?? '');
}

// Sub-navigation between the admin pages.
export function AdminNav() {
  return (
    <nav className={classes.nav} aria-label='Panel administratora'>
      <NavLink to='/admin/klienci' className={linkClass}>
        <Users size={16} aria-hidden />
        Klienci i rabaty
      </NavLink>
      <NavLink to='/admin/rabaty' className={linkClass}>
        <Percent size={16} aria-hidden />
        Szablony rabatów
      </NavLink>
      <NavLink to='/admin/zamowienia' className={linkClass}>
        <ReceiptText size={16} aria-hidden />
        Zamówienia
      </NavLink>
      <NavLink to='/admin/produkty' className={linkClass}>
        <Package size={16} aria-hidden />
        Produkty
      </NavLink>
    </nav>
  );
}
