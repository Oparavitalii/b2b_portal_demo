import { expect, type Page, test } from '@playwright/test';

import { ADMIN, DEMO, login, SAMPLE } from './helpers';

// Per-product rabaty and szablony rabatów (Pilot_Run 2026-10-16), through the real UI:
// the admin creates a szablon (Wtryskiwacze −20%), links it to the demo customer and adds
// the customer's own product rule (pump 0445010507 −30%); the customer sees those prices.
//   095000-5800 (Wtryskiwacze) 588 zł   → −20% → 470,40 zł brutto
//   0445010507  (Pompy CR)    1869 zł  → −30% → 1308,30 zł brutto
// The demo customer is restored at the end (no szablon, no own rules), so later specs
// see only the global %.

const TEMPLATE = 'E2E Wtryskiwacze';
const PUMP = '0445010507';

async function openCustomerDiscounts(admin: Page): Promise<void> {
  await admin.goto('/admin/klienci');
  const row = admin.getByRole('row').filter({ hasText: DEMO.email });
  await row
    .getByRole('button', { name: `Rabaty produktowe klienta ${DEMO.company}` })
    .click();
  await expect(
    admin.getByRole('dialog', { name: `Rabaty produktowe: ${DEMO.company}` }),
  ).toBeVisible();
}

test('szablon + own product rule → the customer pays the per-product prices', async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const customer = await customerContext.newPage();

  try {
    await login(admin, ADMIN.email, ADMIN.password);
    await login(customer, DEMO.email, DEMO.password);

    // 1 · New szablon on its own page: every category and product with a % field.
    await admin.goto('/admin/klienci');
    await admin.getByRole('link', { name: 'Szablony rabatów' }).click();
    await expect(admin).toHaveURL(/\/admin\/rabaty$/);
    await admin.getByRole('button', { name: 'Nowy szablon' }).click();
    await expect(admin).toHaveURL(/\/admin\/rabaty\/nowy$/);
    const saveBar = admin.getByRole('region', { name: 'Zapis szablonu' });
    await expect(saveBar).toContainText('Zapisano');
    await admin.getByLabel('Nazwa szablonu').fill(TEMPLATE);
    await admin.getByLabel('Rabat (%) na kategorię: Wtryskiwacze').fill('20');
    // A product row: own % and the price after it (R00002D 605 zł → −30% → 423,50 zł).
    const variantRow = admin.getByRole('row').filter({ hasText: 'R00002D' });
    await variantRow.getByLabel('Rabat (%): R00002D').fill('30');
    await expect(variantRow).toContainText('423,50');
    await expect(saveBar).toContainText('Niezapisane zmiany');
    await expect(saveBar).toContainText('Kategorie: 1 · Produkty: 1');

    // Leaving with unsaved changes asks first; "Zostań" keeps the edits.
    await admin.getByRole('link', { name: 'Klienci i rabaty' }).first().click();
    const ask = admin.getByRole('dialog', {
      name: 'Zapisać zmiany w szablonie?',
    });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Zostań' }).click();
    await expect(admin).toHaveURL(/\/admin\/rabaty\/nowy$/);
    await expect(admin.getByLabel('Nazwa szablonu')).toHaveValue(TEMPLATE);

    await saveBar.getByRole('button', { name: 'Utwórz szablon' }).click();
    await expect(
      admin.getByText(`Utworzono szablon: ${TEMPLATE}`),
    ).toBeVisible();
    await expect(admin).toHaveURL(/\/admin\/rabaty\/[0-9a-f-]{36}$/);
    await expect(saveBar).toContainText('Zapisano');

    // An edit, then "Wyjdź bez zapisu": the change is dropped.
    await admin.getByLabel('Nazwa szablonu').fill(`${TEMPLATE} X`);
    await admin.getByRole('link', { name: 'Wszystkie szablony' }).click();
    await ask.getByRole('button', { name: 'Wyjdź bez zapisu' }).click();
    await expect(admin).toHaveURL(/\/admin\/rabaty$/);
    const tplRow = admin.getByRole('row').filter({ hasText: TEMPLATE });
    await expect(tplRow).toContainText('Wtryskiwacze: −20%');
    await expect(tplRow).not.toContainText(`${TEMPLATE} X`);

    // 2 · Link it to the demo customer + own rule on one product.
    await openCustomerDiscounts(admin);
    const dialog = admin.getByRole('dialog');
    await dialog.getByLabel('Szablon rabatów').click();
    await admin.getByRole('option', { name: TEMPLATE }).click();
    await expect(dialog.getByText('Wtryskiwacze: −20%')).toBeVisible();
    await dialog.getByRole('button', { name: 'Dodaj produkt' }).click();
    await dialog.getByLabel('Reguła 1: produkt').fill(PUMP);
    await admin.getByRole('option', { name: new RegExp(`^${PUMP}`) }).click();
    await dialog.getByLabel('Reguła 1: rabat (%)').fill('30');
    await dialog.getByRole('button', { name: 'Zapisz' }).click();
    await expect(
      admin.getByText('Zapisano rabaty produktowe klienta'),
    ).toBeVisible();
    const row = admin.getByRole('row').filter({ hasText: DEMO.email });
    await expect(row).toContainText(TEMPLATE);
    await expect(row).toContainText('Własne: 1');

    // 3 · The customer sees the per-product prices.
    await customer.goto(`/produkt/${SAMPLE.sku}`);
    await expect(customer.getByText('470,40 zł brutto')).toBeVisible();
    await expect(customer.getByText('Rabat -20%')).toBeVisible();
    await customer.goto(`/produkt/${PUMP}`);
    await expect(customer.getByText(/1\s?308,30\szł\sbrutto/)).toBeVisible();
    await expect(customer.getByText('Rabat -30%')).toBeVisible();
    await customer.goto('/');
    await expect(customer.getByText('Rabaty indywidualne')).toBeVisible();
  } finally {
    // 4 · Restore: drop the own rule and the szablon (deleting it unlinks the customer).
    await openCustomerDiscounts(admin);
    const dialog = admin.getByRole('dialog');
    const removeRule = dialog.getByRole('button', { name: 'Usuń regułę 1' });
    if (await removeRule.isVisible()) await removeRule.click();
    await dialog.getByRole('button', { name: 'Zapisz' }).click();
    await expect(
      admin.getByText('Zapisano rabaty produktowe klienta'),
    ).toBeVisible();
    await admin.goto('/admin/rabaty');
    const del = admin.getByRole('button', { name: `Usuń szablon ${TEMPLATE}` });
    if (await del.isVisible()) {
      await del.click();
      await admin
        .getByRole('button', { name: 'Usuń szablon', exact: true })
        .click();
      await expect(
        admin.getByText(`Usunięto szablon: ${TEMPLATE}`),
      ).toBeVisible();
    }
    await adminContext.close();
    await customerContext.close();
  }
});
