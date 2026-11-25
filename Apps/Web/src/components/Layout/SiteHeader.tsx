import { Box, Burger, Drawer, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LogIn,
  LogOut,
  Package,
  ReceiptText,
  ShoppingCart,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';

import { ADMIN_HOME, useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/http';

import classes from './Layout.module.css';

// Cart count from GET /api/cart under the shared ['cart'] key (the cart
// feature uses the same key). Prefers `count`, falls back to summing lines.
function cartCountOf(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const { count, lines } = data as { count?: unknown; lines?: unknown };
  if (typeof count === 'number') return count;
  if (!Array.isArray(lines)) return null;
  return lines.reduce<number>((sum, line: unknown) => {
    const qty =
      line && typeof line === 'object' ? (line as { qty?: unknown }).qty : 0;
    return sum + (typeof qty === 'number' ? qty : 0);
  }, 0);
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? `${classes.navLink} ${classes.navLinkActive}`
    : (classes.navLink ?? '');
}

interface NavItemProps {
  to: string;
  end?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
}

function NavItem({ to, end, icon, children, onNavigate }: NavItemProps) {
  return (
    <NavLink to={to} end={end} className={navClass} onClick={onNavigate}>
      {icon}
      {children}
    </NavLink>
  );
}

export function SiteHeader() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // The admin gets only the panel: no catalogue, cart or customer account.
  const isAdmin = user?.role === 'admin';

  const cart = useQuery({
    queryKey: ['cart'],
    queryFn: () => apiFetch<unknown>('/cart'),
    enabled: user !== null && !isAdmin,
    retry: false,
  });
  // A failed request shows no count at all.
  const cartCount = user && !cart.isError ? cartCountOf(cart.data) : null;

  async function logout() {
    close();
    setLoggingOut(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // The session is dropped locally either way.
    } finally {
      clear();
      queryClient.clear();
      setLoggingOut(false);
      navigate('/logowanie', { replace: true });
    }
  }

  const links = (onNavigate?: () => void) =>
    isAdmin ? (
      <>
        <NavItem
          to='/admin/klienci'
          icon={<Users size={18} aria-hidden />}
          onNavigate={onNavigate}
        >
          Klienci i rabaty
        </NavItem>
        <NavItem
          to='/admin/zamowienia'
          icon={<ReceiptText size={18} aria-hidden />}
          onNavigate={onNavigate}
        >
          Zamówienia
        </NavItem>
        <NavItem
          to='/admin/produkty'
          icon={<Package size={18} aria-hidden />}
          onNavigate={onNavigate}
        >
          Produkty
        </NavItem>
      </>
    ) : (
      <>
        <NavItem to='/' end onNavigate={onNavigate}>
          Katalog
        </NavItem>
        <NavItem to='/kontakt' onNavigate={onNavigate}>
          Kontakt
        </NavItem>
      </>
    );

  const logoutButton = (
    <button
      type='button'
      className={`${classes.navLink} ${classes.navButton}`}
      onClick={() => void logout()}
      disabled={loggingOut}
    >
      <LogOut size={18} aria-hidden />
      Wyloguj się
    </button>
  );

  const account = (onNavigate?: () => void) =>
    isAdmin ? (
      logoutButton
    ) : user ? (
      <>
        <NavItem
          to='/koszyk'
          icon={<ShoppingCart size={18} aria-hidden />}
          onNavigate={onNavigate}
        >
          <span>Koszyk</span>
          {cartCount !== null && cartCount > 0 ? (
            <span
              className={classes.cartCount}
              aria-label={`Produkty w koszyku: ${cartCount}`}
            >
              {cartCount}
            </span>
          ) : null}
        </NavItem>
        <NavItem
          to='/moje-konto'
          icon={<User size={18} aria-hidden />}
          onNavigate={onNavigate}
        >
          Moje konto
        </NavItem>
        {logoutButton}
      </>
    ) : (
      <>
        <NavItem
          to='/logowanie'
          icon={<LogIn size={18} aria-hidden />}
          onNavigate={onNavigate}
        >
          Zaloguj się
        </NavItem>
        <NavItem
          to='/rejestracja'
          icon={<UserPlus size={18} aria-hidden />}
          onNavigate={onNavigate}
        >
          Zarejestruj się
        </NavItem>
      </>
    );

  return (
    <header className={classes.header}>
      <div className={classes.headerInner}>
        <Link
          to={isAdmin ? ADMIN_HOME : '/'}
          className={classes.logo}
          aria-label={
            isAdmin ? 'Panel admina DEMO PARTS' : 'Katalog DEMO PARTS, strona główna'
          }
        >
          <img
            src='/img/logo/Catalog_Logo_Kolor.svg'
            width={195}
            height={26}
            alt='DEMO PARTS'
          />
        </Link>

        <Box
          component='nav'
          aria-label='Nawigacja główna'
          className={classes.nav}
          visibleFrom='md'
        >
          {links()}
        </Box>
        <span className={classes.spacer} />
        <Box
          component='nav'
          aria-label='Konto'
          className={classes.nav}
          visibleFrom='md'
        >
          {account()}
        </Box>

        <Group hiddenFrom='md' gap='xs'>
          {user && cartCount !== null && cartCount > 0 ? (
            <Link
              to='/koszyk'
              className={classes.navLink}
              aria-label={`Koszyk: ${cartCount}`}
            >
              <ShoppingCart size={20} aria-hidden />
              <span className={classes.cartCount}>{cartCount}</span>
            </Link>
          ) : null}
          <Burger
            opened={opened}
            onClick={toggle}
            size='sm'
            aria-label='Otwórz menu'
          />
        </Group>
      </div>

      <Drawer
        opened={opened}
        onClose={close}
        position='right'
        size='xs'
        title='Menu'
        hiddenFrom='md'
        closeButtonProps={{ 'aria-label': 'Zamknij menu' }}
      >
        <nav aria-label='Menu' className={classes.drawerNav}>
          {links(close)}
          {account(close)}
        </nav>
      </Drawer>
    </header>
  );
}
