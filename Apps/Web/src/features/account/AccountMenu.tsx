import {
  Code2,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Package,
  ShoppingCart,
  Trash2,
  User,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import classes from './Account.module.css';
import { useLogout } from './useLogout';

export const ACCOUNT_TABS = [
  'dane',
  'haslo',
  'adres',
  'api',
  'usun-konto',
] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];

export function isAccountTab(value: string | null): value is AccountTab {
  return (ACCOUNT_TABS as readonly string[]).includes(value ?? '');
}

interface MenuLink {
  label: string;
  to: string;
  icon: ReactNode;
  tab?: AccountTab;
}

const ICON = { size: 18, 'aria-hidden': true } as const;

// Order history lives at /moje-konto/zamowienia (orders feature); this menu only links to it.
// Koszyk and Kontakt repeat the header links so the account menu is complete on its own.
const LINKS: MenuLink[] = [
  {
    label: 'Dane konta',
    to: '/moje-konto?tab=dane',
    tab: 'dane',
    icon: <User {...ICON} />,
  },
  {
    label: 'Zmiana hasła',
    to: '/moje-konto?tab=haslo',
    tab: 'haslo',
    icon: <KeyRound {...ICON} />,
  },
  {
    label: 'Adres dostawy',
    to: '/moje-konto?tab=adres',
    tab: 'adres',
    icon: <MapPin {...ICON} />,
  },
  {
    label: 'Klucze API',
    to: '/moje-konto?tab=api',
    tab: 'api',
    icon: <Code2 {...ICON} />,
  },
  {
    label: 'Zamówienia',
    to: '/moje-konto/zamowienia',
    icon: <Package {...ICON} />,
  },
  {
    label: 'Koszyk',
    to: '/koszyk',
    icon: <ShoppingCart {...ICON} />,
  },
  {
    label: 'Kontakt',
    to: '/kontakt',
    icon: <Mail {...ICON} />,
  },
  {
    label: 'Usuń konto',
    to: '/moje-konto?tab=usun-konto',
    tab: 'usun-konto',
    icon: <Trash2 {...ICON} />,
  },
];

// Left "Moje konto" menu like shop.catalog-demo.example: sections, orders link, logout.
export function AccountMenu({ active }: { active: AccountTab }) {
  const { logout, pending } = useLogout();

  return (
    <nav aria-label='Moje konto'>
      <ul className={classes.menu}>
        {LINKS.map((link) => {
          const isActive = link.tab === active;
          return (
            <li key={link.to}>
              <Link
                to={link.to}
                className={
                  isActive
                    ? `${classes.menuItem} ${classes.menuItemActive}`
                    : classes.menuItem
                }
                aria-current={isActive ? 'page' : undefined}
              >
                {link.icon}
                {link.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type='button'
            className={classes.menuItem}
            onClick={() => void logout()}
            disabled={pending}
          >
            <LogOut {...ICON} />
            Wyloguj się
          </button>
        </li>
      </ul>
    </nav>
  );
}
