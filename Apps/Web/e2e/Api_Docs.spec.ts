import { expect, test } from '@playwright/test';

// B-21: the client API documentation is public (no login) and readable on a phone.

test('API docs: public page, linked in the footer, no overflow on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/logowanie/);
  await page.getByRole('link', { name: 'Dokumentacja API' }).click();
  await expect(page).toHaveURL(/\/dokumentacja-api$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'API dla klientów (v1)' }),
  ).toBeVisible();
  for (const h of [
    '1. Klucz API',
    '6. Synchronizacja (zalecane)',
    '8. Przykłady',
  ])
    await expect(
      page.getByRole('heading', { level: 2, name: h }),
    ).toBeVisible();
  await expect(page.getByText('%2B02:00').first()).toBeVisible();
  expect(await page.evaluate(() => window.innerWidth)).toBe(390);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
