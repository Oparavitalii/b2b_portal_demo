import { expect, test } from '@playwright/test';

import {
  login,
  ORDER_EMAIL,
  SAMPLE,
  verificationPath,
  waitForMail,
} from './helpers';

// R-03, R-18, R-17, R-21, R-05, R-04/R-09, R-06, R-10 — one company goes from
// registration to a sent order, through the real API and the real mail log.

test('guest opening the catalogue is sent to /logowanie', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/logowanie$/);
  await expect(
    page.getByRole('heading', { name: 'Zaloguj się' }),
  ).toBeVisible();
});

test('company registers, confirms e-mail, finds a part by OE number and sends an order', async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `firma.${stamp}@example.com`;
  const password = 'Haslo12345!';
  const company = `Warsztat E2E ${stamp}`;

  // 1. Registration → "Sprawdź skrzynkę".
  await page.goto('/rejestracja');
  // Registration asks only for login + password (company data comes later).
  await page.getByLabel('Adres e-mail (login)').fill(email);
  await page.getByLabel('Hasło').fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Załóż konto' }).click();
  await expect(page.getByText('Sprawdź skrzynkę e-mail')).toBeVisible();

  // 2. Verification link from storage/mail.log → account active.
  const verifyMail = await waitForMail(
    (m) => m.to === email && m.text.includes('/potwierdz-email?token='),
  );
  await page.goto(verificationPath(verifyMail));
  await expect(
    page.getByRole('heading', { name: 'Adres e-mail potwierdzony' }),
  ).toBeVisible();

  // 3. Login → catalogue with the 4 sample products.
  await login(page, email, password);
  await expect(page.getByText('Znaleziono: 4 produkty')).toBeVisible();

  // 4. Search by an OE number (not the SKU) → exactly the Denso injector.
  await page.getByLabel('Szukaj').fill(SAMPLE.oeNumber);
  await expect(page.getByText('Znaleziono: 1 produkt')).toBeVisible();
  await page.getByRole('link', { name: new RegExp(SAMPLE.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/produkt/${SAMPLE.sku}$`));
  await expect(
    page.getByRole('heading', { name: new RegExp(SAMPLE.name) }),
  ).toBeVisible();

  // 5. Add to cart.
  await page.getByRole('button', { name: 'Dodaj do koszyka' }).click();
  await expect(page.getByText('Dodano do koszyka')).toBeVisible();

  // 6a. Without company data the cart refuses to send the order.
  await page.goto('/koszyk');
  await expect(page.getByText(/Brak danych firmy/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Wyślij zamówienie' }),
  ).toBeDisabled();

  // 6b. Company data in "Moje konto".
  await page.goto('/moje-konto?tab=dane');
  await page.getByLabel('Nazwa firmy').fill(company);
  await page.getByLabel('NIP').fill('5260250274');
  await page.getByLabel('Imię i nazwisko osoby kontaktowej').fill('Anna Nowak');
  await page.getByLabel('Telefon').fill('+48 600 700 800');
  await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect(page.getByText('Dane konta zapisane.')).toBeVisible();

  // 6c. Delivery address (company name and phone are prefilled from the account).
  await page.goto('/moje-konto?tab=adres');
  await page.getByLabel('Ulica i numer').fill('ul. Testowa 5');
  await page.getByLabel('Kod pocztowy').fill('02-123');
  await page.getByLabel('Miejscowość').fill('Kraków');
  await page.getByRole('button', { name: 'Zapisz adres' }).click();
  await expect(page.getByText('Adres dostawy zapisany.')).toBeVisible();

  // 7. Cart → send the order → success screen with the CDM number.
  await page.goto('/koszyk');
  await expect(page.getByLabel('Pozycje w koszyku')).toContainText(SAMPLE.sku);
  await expect(page.getByText('ul. Testowa 5')).toBeVisible();
  await page.getByRole('button', { name: 'Wyślij zamówienie' }).click();
  await expect(
    page.getByRole('heading', { name: 'Zamówienie wysłane' }),
  ).toBeVisible();
  const status = page.getByRole('status').filter({ hasText: /CDM-/ });
  await expect(status).toContainText(/CDM-\d{4}-\d{4}/);
  const number = /CDM-\d{4}-\d{4}/.exec(await status.innerText())?.[0];
  expect(number).toBeTruthy();

  // 8. The order is in the history.
  await page.goto('/moje-konto/zamowienia');
  await expect(page.getByRole('link', { name: number })).toBeVisible();

  // 9. The company got the order mail (ORDER_EMAIL), naming the order and the customer.
  const orderMail = await waitForMail(
    (m) => m.to === ORDER_EMAIL && m.subject.includes(number ?? '-'),
  );
  expect(orderMail.subject).toContain(company);
  expect(orderMail.text).toContain(SAMPLE.sku);
});
