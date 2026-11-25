import { expect, test } from '@playwright/test';

import { ADMIN, DEMO, login, SAMPLE } from './helpers';

// Blind-test gaps closed on 2026-10-08. Runs after Full_Flow.spec.ts (files run
// in name order on one worker), so the order and the "Warsztat E2E" customer
// registered there already exist in the shared E2E database.

test('customer adds to the cart from the catalogue list; account menu has Koszyk and Kontakt', async ({
  page,
}) => {
  await login(page, DEMO.email, DEMO.password);

  await page
    .getByRole('button', { name: `Dodaj do koszyka: ${SAMPLE.name}` })
    .click();
  await expect(page.getByText('Dodano do koszyka')).toBeVisible();

  await page.goto('/moje-konto');
  const menu = page.getByRole('navigation', { name: 'Moje konto' });
  await expect(menu.getByRole('link', { name: 'Kontakt' })).toHaveAttribute(
    'href',
    '/kontakt',
  );
  await menu.getByRole('link', { name: 'Koszyk' }).click();
  await expect(page).toHaveURL(/\/koszyk$/);
  await expect(page.getByLabel('Pozycje w koszyku')).toContainText(SAMPLE.sku);
});

test('admin sees received orders, blocks and unblocks a customer, deletes an account', async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const customer = await customerContext.newPage();

  try {
    await login(admin, ADMIN.email, ADMIN.password);

    // Orders list → one order in full.
    await admin.goto('/admin/zamowienia');
    const orderRow = admin.getByRole('row').filter({ hasText: 'Warsztat E2E' });
    await expect(orderRow.first()).toBeVisible();
    await orderRow.first().getByRole('link', { name: /CDM-/ }).click();
    await expect(admin).toHaveURL(/\/admin\/zamowienia\/[0-9a-f-]{36}$/);
    await expect(admin.getByRole('heading', { name: 'Pozycje' })).toBeVisible();
    await expect(admin.getByText(SAMPLE.sku).first()).toBeVisible();

    // Block the demo customer → their login is refused with a clear message.
    await admin.goto('/admin/klienci');
    const demoRow = admin.getByRole('row').filter({ hasText: DEMO.email });
    await demoRow.getByRole('button', { name: /^Zablokuj klienta/ }).click();
    await admin
      .getByRole('dialog')
      .getByRole('button', { name: 'Zablokuj' })
      .click();
    await expect(demoRow.getByText('Zablokowany')).toBeVisible();

    await customer.goto('/logowanie');
    await customer.getByLabel('Adres e-mail').fill(DEMO.email);
    await customer.getByLabel('Hasło', { exact: false }).fill(DEMO.password);
    await customer.getByRole('button', { name: 'Zaloguj się' }).click();
    await expect(customer.getByText(/Konto zostało zablokowane/)).toBeVisible();

    // Unblock → the customer logs in again.
    await demoRow.getByRole('button', { name: /^Odblokuj klienta/ }).click();
    await admin
      .getByRole('dialog')
      .getByRole('button', { name: 'Odblokuj' })
      .click();
    await expect(demoRow.getByText('Zablokowany')).toHaveCount(0);
    await login(customer, DEMO.email, DEMO.password);

    // Delete the customer registered by Full_Flow → gone from the list,
    // their order stays and is marked "Konto usunięte".
    const e2eRow = admin
      .getByRole('row')
      .filter({ hasText: 'Warsztat E2E' })
      .first();
    await e2eRow.getByRole('button', { name: /^Usuń klienta/ }).click();
    await admin
      .getByRole('dialog')
      .getByRole('button', { name: 'Usuń konto' })
      .click();
    await expect(admin.getByText(/Usunięto konto: Warsztat E2E/)).toBeVisible();
    await expect(
      admin.getByRole('row').filter({ hasText: 'Warsztat E2E' }),
    ).toHaveCount(0);

    await admin.goto('/admin/zamowienia');
    await expect(
      admin
        .getByRole('row')
        .filter({ hasText: 'Warsztat E2E' })
        .first()
        .getByText('Konto usunięte'),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await customerContext.close();
  }
});
