import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, type Page } from '@playwright/test';

// Shared by playwright.config.ts (server env) and the specs (logins, mail.log).
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const API_DIR = path.resolve(webDir, '..', 'Api_Php');
/** Storage of the API under test — mail.log (MAIL_DRIVER=log) lands here. */
export const STORAGE_DIR = path.join(API_DIR, 'storage');
export const MAIL_LOG = path.join(STORAGE_DIR, 'mail.log');
export const SAMPLE_PRODUCTS = path.join(
  API_DIR,
  'tests',
  'Fixtures',
  'Products_Data_Sample.json',
);

// Throwaway passwords for the temporary E2E database. Set once in the runner
// process (playwright.config.ts imports this file first); the workers inherit
// the environment, so every process sees the same values. Override with
// E2E_ADMIN_PASSWORD / E2E_DEMO_PASSWORD (at least 12 characters).
const adminPassword = (process.env.E2E_ADMIN_PASSWORD ||= `e2e-admin-${randomBytes(8).toString('hex')}`);
const demoPassword = (process.env.E2E_DEMO_PASSWORD ||= `e2e-demo-${randomBytes(8).toString('hex')}`);

/** Seeded by database/Seed.php (values passed explicitly to the server). */
export const ADMIN = {
  email: 'admin@catalog-demo.local',
  password: adminPassword,
};
export const DEMO = {
  email: 'demo@catalog-demo.local',
  password: demoPassword,
  company: 'Auto Serwis Demo sp. z o.o.',
};
/** ORDER_EMAIL of the server under test — the company inbox for order mails. */
export const ORDER_EMAIL = 'zamowienia.e2e@catalog-demo.local';

/** Products_Data_Sample.json: Denso 095000-5800, 588 zł gross, no variants. */
export const SAMPLE = {
  sku: '095000-5800',
  name: 'Wtryskiwacz Denso 095000-5800',
  oeNumber: '6C1Q9K546AB',
};

export interface LoggedMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  at: string;
}

/** Every message the API wrote to storage/mail.log (one JSON object per line). */
export function readMails(): LoggedMail[] {
  if (!existsSync(MAIL_LOG)) return [];
  return readFileSync(MAIL_LOG, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LoggedMail);
}

/** Newest mail matching the predicate; polls because the API writes it after responding to the UI. */
export async function waitForMail(
  match: (mail: LoggedMail) => boolean,
): Promise<LoggedMail> {
  let found: LoggedMail | undefined;
  await expect
    .poll(
      () => {
        found = readMails().filter(match).pop();
        return found !== undefined;
      },
      { message: 'mail not found in storage/mail.log', timeout: 10_000 },
    )
    .toBe(true);
  return found as LoggedMail;
}

/** Path + query of the /potwierdz-email link inside a verification mail. */
export function verificationPath(mail: LoggedMail): string {
  const match =
    /https?:\/\/[^\s"<>)]+\/potwierdz-email\?token=[^\s"<>)&]+/.exec(mail.text);
  if (!match) throw new Error(`No verification link in mail "${mail.subject}"`);
  const url = new URL(match[0]);
  return url.pathname + url.search;
}

/** Logs in through /logowanie and waits for the catalogue. */
export async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło', { exact: false }).fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  // A customer lands on the catalogue, the admin on the panel (orders).
  await expect(page).toHaveURL(/\/$|\/admin\/zamowienia$/);
  if (page.url().endsWith('/admin/zamowienia')) return;
  await expect(
    page.getByRole('heading', { name: 'Części regenerowane DEMO PARTS' }),
  ).toBeVisible();
}
