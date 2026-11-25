// npm run env:push — puts Apps/Api_Php/.env on the live server and applies the admin password.
//   npm run env:push        upload .env + Reset_Admin.flag, wait for the server to apply it
//   npm run env:push:dry    check the local file and show the plan, no connection
// The server's current .env is kept as .env.prev_<date>. The new file is uploaded under a
// temporary name and renamed, so PHP never reads half a file. The flag makes the next API
// request copy ADMIN_EMAIL / ADMIN_PASSWORD into the database (src/Services/Admin_Password.php),
// which writes one line to storage/setup.log — read back here. No value is ever printed.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { Client as FtpClient } from 'basic-ftp';

import { fail, loadConfig } from './Remote';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const localEnv = path.join(repoRoot, 'Apps', 'Api_Php', '.env');
const siteUrl = (
  process.env.DEPLOY_SITE_URL?.trim() || 'https://portal.catalog-demo.example'
).replace(/\/+$/, '');

const REQUIRED = [
  'APP_ENV',
  'APP_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ORDER_EMAIL',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'MAIL_DRIVER',
];
const WAIT_MS = 60_000;
const POLL_MS = 4_000;

/** Key names with empty values. Reads the file, never prints a value. */
function missingKeys(): string[] {
  let text: string;
  try {
    text = readFileSync(localEnv, 'utf8');
  } catch {
    fail(`${path.relative(repoRoot, localEnv)} not found.`);
  }
  const set = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2].replace(/^(['"])(.*)\1$/, '$2') !== '') set.add(m[1]);
  }
  return REQUIRED.filter((k) => !set.has(k));
}

/** 2026-10-09T14:20 → 2026_10_09_1420 (UTC). */
const stamp = (d: Date) => {
  const iso = d.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '_')}_${iso.slice(11, 13)}${iso.slice(14, 16)}`;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.protocol === 'sftp')
    fail('env:push supports FTP/FTPS only (the hosting account has no SSH).');

  const missing = missingKeys();
  if (missing.length > 0) fail(`.env has empty keys: ${missing.join(', ')}`);

  const started = new Date();
  const appDir = path.posix.join(config.appDir, 'Api_Php');
  const backup = `.env.prev_${stamp(started)}`;

  console.log('\n=== DEMO PARTS katalog — env push ===');
  console.log(`  File:      ${path.relative(repoRoot, localEnv)} (all ${REQUIRED.length} required keys set)`);
  console.log(`  Target:    ${appDir}/.env (current one kept as ${backup})`);
  console.log(`  Then:      ${appDir}/storage/Reset_Admin.flag → admin password applied`);
  if (config.dryRun) {
    console.log('\nDry run finished — no connection was made.');
    return;
  }

  const ftp = new FtpClient(30_000);
  try {
    await ftp.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.protocol === 'ftps',
      secureOptions: { rejectUnauthorized: false },
    });
    const home = await ftp.pwd();
    const abs = (p: string) => path.posix.join(home, appDir, p);
    const names = async (dir: string) =>
      (await ftp.list(abs(dir)).catch(() => [])).map((f) => f.name);

    await ftp.uploadFrom(localEnv, abs('.env.uploading'));
    if ((await names('.')).includes('.env'))
      await ftp.rename(abs('.env'), abs(backup));
    await ftp.rename(abs('.env.uploading'), abs('.env'));
    console.log(`\n.env uploaded; previous one saved as ${backup}.`);

    const flagDir = mkdtempSync(path.join(tmpdir(), 'env_push_'));
    const flagLocal = path.join(flagDir, 'Reset_Admin.flag');
    writeFileSync(flagLocal, `${started.toISOString()}\n`);
    await ftp.ensureDir(abs('storage'));
    await ftp.uploadFrom(flagLocal, abs('storage/Reset_Admin.flag'));
    console.log('Flag uploaded. Waking the API so it applies the admin password…');

    // The host may answer scripts with a bot-check page; then it runs on the first real visit.
    await fetch(`${siteUrl}/api/health`).catch(() => undefined);
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      if (!(await names('storage')).includes('Reset_Admin.flag')) {
        const chunks: Buffer[] = [];
        await ftp.downloadTo(
          new Writable({
            write(chunk: Buffer, _enc, done) {
              chunks.push(chunk);
              done();
            },
          }),
          abs('storage/setup.log'),
        );
        const line = Buffer.concat(chunks)
          .toString('utf8')
          .split('\n')
          .filter((l) => l.includes('admin reset'))
          .pop();
        console.log(`\nServer: ${line ?? '(flag consumed, no log line found)'}`);
        if (!line || line.includes('failed') || line.includes('cannot'))
          process.exitCode = 1;
        return;
      }
      await sleep(POLL_MS);
      await fetch(`${siteUrl}/api/health`).catch(() => undefined);
    }
    console.log(
      `\nThe flag is on the server but not applied yet (no API request reached PHP in ${WAIT_MS / 1000}s).`,
    );
    console.log(
      `Open ${siteUrl}/api/health in a browser, then log in — the password is applied on that first request.`,
    );
    process.exitCode = 2;
  } finally {
    ftp.close();
  }
}

main().catch((err: unknown) => {
  fail(`env push failed: ${err instanceof Error ? err.message : String(err)}`);
});
