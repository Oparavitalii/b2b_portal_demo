import { expect, test } from '@playwright/test';

import { ADMIN, DEMO, login, SAMPLE } from './helpers';

// B-21: the customer makes an API key in Moje konto, the key reads the catalogue with
// the customer's own prices, the admin sees the key, revoking it cuts access at once.
// DEMO has a 10% discount; SAMPLE is 588,00 zł gross → 529,20 zł for DEMO.

test('API key: create in Moje konto, read prices, admin sees it, revoke', async ({
  page,
  request,
}) => {
  await login(page, DEMO.email, DEMO.password);
  await page.goto('/moje-konto?tab=api');
  await expect(
    page.getByRole('heading', { name: 'Klucze API' }).first(),
  ).toBeVisible();

  await page.getByLabel('Nazwa klucza').fill('E2E integracja');
  await page.getByRole('button', { name: 'Utwórz klucz' }).click();
  const plain = page.getByTestId('api-key-plain');
  await expect(plain).toContainText('cdm_live_');
  const key = (await plain.innerText()).trim();
  await page.getByRole('button', { name: 'Zapisałem klucz' }).click();
  const row = page.getByRole('row', { name: /E2E integracja/ });
  await expect(row).toContainText(key.slice(0, 13));
  await expect(row).not.toContainText(key);

  const auth = { Authorization: `Bearer ${key}` };
  const one = await request.get(
    `/api/v1/products/${encodeURIComponent(SAMPLE.sku)}`,
    { headers: auth },
  );
  expect(one.status()).toBe(200);
  const body = await one.json();
  expect(body.discountPercent).toBe(10);
  expect(body.item.price.unitGross).toBe(52920);
  expect(body.item.imageUrl ?? 'http').toMatch(/^http/);

  const list = await request.get('/api/v1/products?pageSize=500', {
    headers: auth,
  });
  expect(list.status()).toBe(200);
  const page1 = await list.json();
  expect(page1.total).toBeGreaterThan(0);
  expect(page1.items.length).toBe(page1.total);

  // Admin: the same key in the customer's API drawer.
  const admin = await page.context().browser()!.newContext();
  const adminPage = await admin.newPage();
  await login(adminPage, ADMIN.email, ADMIN.password);
  await adminPage.goto('/admin/klienci');
  await adminPage
    .getByRole('button', {
      name: new RegExp(`Klucze API klienta ${DEMO.company}`),
    })
    .click();
  await expect(
    adminPage.getByRole('row', { name: /E2E integracja/ }),
  ).toBeVisible();
  // The admin has no keys of their own: the account tab points to the panel.
  await adminPage.goto('/moje-konto?tab=api');
  await expect(
    adminPage.getByText('Konto administratora nie ma własnych kluczy API'),
  ).toBeVisible();
  await expect(adminPage.getByText('Nie udało się wczytać kluczy')).toHaveCount(
    0,
  );
  await admin.close();

  // Revoke → 401.
  await row.getByRole('button', { name: /Unieważnij klucz/ }).click();
  await page.getByRole('button', { name: 'Unieważnij', exact: true }).click();
  await expect(row).toContainText('Unieważniony');
  const after = await request.get('/api/v1/products', { headers: auth });
  expect(after.status()).toBe(401);
});
