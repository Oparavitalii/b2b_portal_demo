import { expect, type Page, test } from '@playwright/test';

import { ADMIN, DEMO, login, SAMPLE } from './helpers';

// R-02: the admin sets a customer's catalogue discount; the customer sees the
// badge and the reduced price. Sample product 095000-5800 costs 588 zł gross:
//   0 %  → 588,00 zł brutto / 478,05 zł netto
//   10 % → 529,20 zł brutto / 430,24 zł netto  (net = round(gross / 1.23))
// The demo customer is seeded with 10 %, so the test first resets it to 0 %
// to prove the change really comes from the admin panel.

async function setDiscount(admin: Page, percent: number): Promise<void> {
  await admin.goto('/admin/klienci');
  const row = admin.getByRole('row').filter({ hasText: DEMO.email });
  await expect(row).toBeVisible();
  const input = row.getByLabel(`Rabat (%) dla: ${DEMO.company}`);
  await input.fill(String(percent));
  await row.getByRole('button', { name: 'Zapisz' }).click();
  await expect(
    admin.getByText(`Rabat dla ${DEMO.company}: ${percent}%`),
  ).toBeVisible();
}

test('admin sets 10% for the demo customer → customer sees "Rabat -10%" and the reduced price', async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const customer = await customerContext.newPage();

  try {
    await login(admin, ADMIN.email, ADMIN.password);
    await login(customer, DEMO.email, DEMO.password);

    // Baseline: no discount → full price, no badge.
    await setDiscount(admin, 0);
    await customer.goto(`/produkt/${SAMPLE.sku}`);
    await expect(customer.getByText('588,00 zł brutto')).toBeVisible();
    await expect(customer.getByText(/Rabat -/)).toHaveCount(0);

    // Admin sets 10 %.
    await setDiscount(admin, 10);

    // Customer (fresh page load) sees the badge and the reduced price.
    await customer.reload();
    await expect(customer.getByText('Rabat -10%')).toBeVisible();
    await expect(customer.getByText('529,20 zł brutto')).toBeVisible();
    await expect(customer.getByText('430,24 zł')).toBeVisible();

    // The catalogue shows the same discount for this customer.
    await customer.goto('/');
    await expect(customer.getByText('Rabat -10%').first()).toBeVisible();
  } finally {
    await adminContext.close();
    await customerContext.close();
  }
});
