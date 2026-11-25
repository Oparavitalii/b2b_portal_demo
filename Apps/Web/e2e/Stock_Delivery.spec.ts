import { expect, type Locator, test } from '@playwright/test';

import { DEMO, login, SAMPLE } from './helpers';

/** E2E_SHOTS=<dir> saves element screenshots for a visual check; off by default. */
async function shot(name: string, el: Locator): Promise<void> {
  const dir = process.env.E2E_SHOTS;
  if (dir) await el.first().screenshot({ path: `${dir}/Stock_${name}.png` });
}

// B-19: stock and delivery time on the card, the product page and in the cart.
// Every product starts with 4 pieces (schema default, owner 2026-10-10). Display only.

test('stock and delivery time: 24 h from stock, 72 h when ordering more than in stock', async ({
  page,
}) => {
  await login(page, DEMO.email, DEMO.password);

  const card = page.locator('article', { hasText: `SKU ${SAMPLE.sku}` });
  await expect(card).toContainText('W magazynie: 4 szt.');
  await expect(card).toContainText('Wysyłka w 24 h');
  await shot('card', card);

  await page.goto(`/produkt/${encodeURIComponent(SAMPLE.sku)}`);
  await expect(page.getByText('W magazynie: 4 szt.')).toBeVisible();
  await expect(page.getByText('Wysyłka w 24 h')).toBeVisible();
  // Shown once, next to the price — not repeated under "Parametry".
  await expect(page.getByText('Stan magazynowy')).toHaveCount(0);

  const qty = page.getByLabel('Ilość');
  await qty.fill('5');
  await qty.blur();
  await expect(page.getByText('Wysyłka w 72 h')).toBeVisible();
  await expect(page.getByText('całość z produkcji')).toHaveCount(0);
  await shot('buybox', page.locator('[class*=buyBox]'));
  await page.getByRole('button', { name: 'Dodaj do koszyka' }).click();
  await expect(page.getByText('Dodano do koszyka')).toBeVisible();

  // The cart line follows its own quantity (≥ 5 here, whatever earlier specs added).
  await page.goto('/koszyk');
  const line = page
    .getByLabel('Pozycje w koszyku')
    .locator('li', { hasText: SAMPLE.sku });
  await expect(line).toContainText('W magazynie: 4 szt.');
  await expect(line).toContainText('Wysyłka w 72 h');
  await expect(line).not.toContainText('całość z produkcji');
  await shot('cart', line);
});
