import { expect, test } from '@playwright/test';

import { ADMIN, login } from './helpers';

// The admin works only in the panel: after login the orders list, the header
// shows the panel sections + logout, never the customer catalogue, cart or account.
test('admin lands in the panel and sees only panel navigation', async ({
  page,
}) => {
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/admin\/zamowienia$/);

  const header = page.getByRole('navigation', { name: 'Nawigacja główna' });
  await expect(
    header.getByRole('link', { name: 'Klienci i rabaty' }),
  ).toBeVisible();
  await expect(header.getByRole('link', { name: 'Zamówienia' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Produkty' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Katalog' })).toHaveCount(0);

  const account = page.getByRole('navigation', { name: 'Konto' });
  await expect(
    account.getByRole('button', { name: 'Wyloguj się' }),
  ).toBeVisible();
  await expect(account.getByRole('link', { name: /Koszyk/ })).toHaveCount(0);
  await expect(account.getByRole('link', { name: 'Moje konto' })).toHaveCount(
    0,
  );

  // The catalogue home sends the admin back to the panel.
  await page.goto('/');
  await expect(page).toHaveURL(/\/admin\/zamowienia$/);
});
