import { expect, type Locator, type Page, test } from '@playwright/test';

import { ADMIN, DEMO, login } from './helpers';

// Pilot_Run 2026-10-10: the admin edits stock / delivery time in the table, adds a
// product by hand and edits it in the drawer; the customer sees every change.
// Uses the Bosch pump of the sample (not SAMPLE.sku, which Stock_Delivery expects at 4 pieces).

const PUMP = '0445010507';

/** E2E_SHOTS=<dir> saves screenshots for a visual check; off by default. */
async function shot(name: string, el: Locator | Page): Promise<void> {
  const dir = process.env.E2E_SHOTS;
  if (dir) await el.screenshot({ path: `${dir}/Admin_Products_${name}.png` });
}
const NEW_SKU = 'BX-E2E-NOWY';

async function openProducts(admin: Page, q: string) {
  await admin.goto('/admin/produkty');
  await admin.getByLabel('Szukaj produktu').fill(q);
  await expect(admin.getByText('Produktów: 1')).toBeVisible();
  return admin.locator('tbody tr', { hasText: q });
}

test('admin edits stock + delivery time and adds a product → the customer sees both', async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const customer = await customerContext.newPage();

  try {
    await login(admin, ADMIN.email, ADMIN.password);
    await login(customer, DEMO.email, DEMO.password);

    // Default for a pump: 1 piece, 72 h (injectors: 4 pieces, automatic time).
    const row = await openProducts(admin, PUMP);
    await expect(row).toHaveCount(1);
    const stock = row.getByLabel(`Stan magazynowy (szt.): ${PUMP}`);
    await expect(stock).toHaveValue('1 szt.');
    await expect(row).toContainText(
      'Klient widzi: W magazynie: 1 szt. · Wysyłka w 72 h',
    );

    // Table: 2 pieces, 48 h.
    await stock.fill('2');
    await row.getByLabel(`Czas wysyłki: ${PUMP}`).click();
    await admin.getByRole('option', { name: '48 h' }).click();
    await row.getByRole('button', { name: 'Zapisz' }).click();
    await expect(
      admin.getByText(`${PUMP}: stan 2 szt., wysyłka 48 h`),
    ).toBeVisible();
    await shot('table', admin);

    await customer.goto(`/produkt/${PUMP}`);
    await expect(customer.getByText('W magazynie: 2 szt.')).toBeVisible();
    await expect(customer.getByText('Wysyłka w 48 h')).toBeVisible();
    await shot('client', customer);

    // Add a product by hand.
    await admin.getByRole('button', { name: 'Dodaj produkt' }).click();
    const drawer = admin.getByRole('dialog', { name: 'Nowy produkt' });
    await drawer.getByLabel('SKU').fill(NEW_SKU);
    await drawer.getByLabel('Nazwa').fill('Pompa testowa E2E');
    await drawer.getByLabel('Kategoria').fill('Pompy CR');
    await drawer.getByLabel('Cena brutto (zł)').fill('1234,5');
    await expect(drawer.getByLabel('Stan magazynowy (szt.)')).toHaveValue('1');
    await drawer.getByLabel('Stan magazynowy (szt.)').fill('7');
    await drawer
      .getByRole('radiogroup', { name: 'Orientacyjny czas wysyłki' })
      .getByText('72 h')
      .click();
    await shot('new', drawer);
    await drawer.getByRole('button', { name: 'Dodaj produkt' }).click();
    await expect(admin.getByText(`Dodano produkt ${NEW_SKU}.`)).toBeVisible();

    // The same SKU again is refused in the form.
    await admin.getByRole('button', { name: 'Dodaj produkt' }).click();
    const again = admin.getByRole('dialog', { name: 'Nowy produkt' });
    await again.getByLabel('SKU').fill(NEW_SKU);
    await again.getByLabel('Nazwa').fill('Duplikat');
    await again.getByLabel('Cena brutto (zł)').fill('10');
    await again.getByRole('button', { name: 'Dodaj produkt' }).click();
    await expect(
      again.getByText('Produkt z tym SKU już istnieje.'),
    ).toBeVisible();
    await again.getByRole('button', { name: 'Anuluj' }).click();

    await customer.goto(`/?q=${NEW_SKU}`);
    const card = customer.locator('article', { hasText: `SKU ${NEW_SKU}` });
    await expect(card).toContainText('Pompa testowa E2E');
    await expect(card).toContainText('W magazynie: 7 szt.');
    await expect(card).toContainText('Wysyłka w 72 h');

    // Edit it in the drawer: new name, out of stock, automatic time → production 72 h.
    const newRow = await openProducts(admin, NEW_SKU);
    await newRow.getByRole('button', { name: `Edytuj ${NEW_SKU}` }).click();
    const edit = admin.getByRole('dialog', { name: `Edycja: ${NEW_SKU}` });
    await expect(edit.getByLabel('Nazwa')).toHaveValue('Pompa testowa E2E');
    await edit.getByLabel('Nazwa').fill('Pompa testowa E2E (zmieniona)');
    await edit.getByLabel('Stan magazynowy (szt.)').fill('0');
    await edit
      .getByRole('radiogroup', { name: 'Orientacyjny czas wysyłki' })
      .getByText('Auto', { exact: true })
      .click();
    await edit.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await expect(admin.getByText(`Zapisano produkt ${NEW_SKU}.`)).toBeVisible();

    await customer.goto(`/produkt/${NEW_SKU}`);
    await expect(
      customer.getByRole('heading', { name: 'Pompa testowa E2E (zmieniona)' }),
    ).toBeVisible();
    await expect(customer.getByText('W produkcji')).toBeVisible();
    await expect(customer.getByText('Wysyłka w 72 h')).toBeVisible();

    // Hide it again: the customer no longer finds it (and later specs see the 4 sample products).
    await admin
      .getByRole('row', { name: new RegExp(NEW_SKU) })
      .getByRole('button', { name: `Edytuj ${NEW_SKU}` })
      .click();
    const hide = admin.getByRole('dialog', { name: `Edycja: ${NEW_SKU}` });
    await hide.getByText('Widoczny w katalogu').click();
    await expect(hide.getByLabel('Widoczny w katalogu')).not.toBeChecked();
    await hide.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await expect(admin.getByText(`Zapisano produkt ${NEW_SKU}.`)).toBeVisible();
    await customer.goto(`/?q=${NEW_SKU}`);
    await expect(
      customer.getByText('Brak produktów dla wybranych filtrów'),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await customerContext.close();
  }
});

// Owner, 2026-10-12: checked rows (kept across searches) get one change at once.
test('admin selects products across searches and changes stock + delivery time at once', async ({
  browser,
}) => {
  const OTHER = '0445117010';
  const adminContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const customer = await customerContext.newPage();

  try {
    await login(admin, ADMIN.email, ADMIN.password);
    await login(customer, DEMO.email, DEMO.password);

    const pump = await openProducts(admin, PUMP);
    await pump.getByLabel(`Zaznacz ${PUMP}`).check();
    const bar = admin.getByRole('region', { name: 'Zaznaczone produkty' });
    await expect(bar).toContainText('Zaznaczono: 1');

    // A second search keeps the first product selected.
    await admin.getByLabel('Szukaj produktu').fill(OTHER);
    await expect(admin.getByLabel(`Zaznacz ${OTHER}`)).toBeVisible();
    await admin.getByLabel('Zaznacz wszystkie na stronie').check();
    await expect(bar).toContainText('Zaznaczono: 2');

    await bar.getByRole('button', { name: 'Zmień zaznaczone' }).click();
    const modal = admin.getByRole('dialog', {
      name: 'Zmiana zaznaczonych produktów (2)',
    });
    const save = modal.getByRole('button', { name: 'Zmień produkty: 2' });
    await expect(save).toBeDisabled();
    await modal.getByLabel('Stan magazynowy (szt.)').fill('6');
    await modal.getByLabel('Orientacyjny czas wysyłki').click();
    await admin.getByRole('option', { name: '48 h' }).click();
    await shot('bulk', admin);
    await save.click();
    await expect(admin.getByText('Zmieniono produktów: 2.')).toBeVisible();
    await expect(bar).toHaveCount(0);

    for (const sku of [PUMP, OTHER]) {
      const row = await openProducts(admin, sku);
      await expect(row).toContainText(
        'Klient widzi: W magazynie: 6 szt. · Wysyłka w 48 h',
      );
      await customer.goto(`/produkt/${sku}`);
      await expect(customer.getByText('W magazynie: 6 szt.')).toBeVisible();
      await expect(customer.getByText('Wysyłka w 48 h')).toBeVisible();
    }
  } finally {
    await adminContext.close();
    await customerContext.close();
  }
});
