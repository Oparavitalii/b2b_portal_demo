// npm run products:push — puts Products_Data.json into the live catalogue without the admin panel.
//   npm run products:push       upload + wait for the server to import
//   npm run products:push:dry   validate the file and show the plan, no connection
// Source: Apps/Api_Php/storage/import/Products_Data.json (from `npm run products:sync`).
// The file goes to DEPLOY_APP_DIR/Api_Php/storage/import/Pending_Products.json, uploaded under a
// temporary name and renamed, so the server never reads half a file. The API imports it on the
// next request (src/Services/Pending_Import.php) and writes Last_Import.json, which is read back here.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';

import { type Config, fail, loadConfig } from './Remote';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const localFile = path.join(
  repoRoot,
  'Apps',
  'Api_Php',
  'storage',
  'import',
  'Products_Data.json',
);
const siteUrl = (
  process.env.DEPLOY_SITE_URL?.trim() || 'https://portal.catalog-demo.example'
).replace(/\/+$/, '');

const WAIT_MS = 60_000;
const POLL_MS = 4_000;

/** The few remote operations this script needs, over FTP/FTPS or SFTP. */
interface Remote {
  put(local: string, remote: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(remote: string): Promise<boolean>;
  read(remote: string): Promise<string | null>;
  close(): Promise<void>;
}

async function openFtp(config: Config): Promise<Remote> {
  const ftp = new FtpClient(30_000);
  await ftp.access({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    secure: config.protocol === 'ftps',
    // Shared hosts often present a self-signed certificate on the data channel.
    secureOptions: { rejectUnauthorized: false },
  });
  const home = await ftp.pwd();
  const abs = (p: string) => path.posix.join(home, p);
  const exists = async (remote: string): Promise<boolean> => {
    const list = await ftp.list(path.posix.dirname(abs(remote)));
    return list.some((f) => f.name === path.posix.basename(remote));
  };
  return {
    async put(local, remote) {
      await ftp.ensureDir(path.posix.dirname(abs(remote)));
      await ftp.uploadFrom(local, abs(remote));
    },
    async rename(from, to) {
      await ftp.remove(abs(to), true);
      await ftp.rename(abs(from), abs(to));
    },
    exists,
    async read(remote) {
      if (!(await exists(remote))) return null;
      const chunks: Buffer[] = [];
      await ftp.downloadTo(
        new Writable({
          write(chunk: Buffer, _enc, done) {
            chunks.push(chunk);
            done();
          },
        }),
        abs(remote),
      );
      return Buffer.concat(chunks).toString('utf8');
    },
    async close() {
      ftp.close();
    },
  };
}

async function openSftp(config: Config): Promise<Remote> {
  const sftp = new SftpClient();
  await sftp.connect({
    host: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    readyTimeout: 15_000,
  });
  return {
    async put(local, remote) {
      await sftp.mkdir(path.posix.dirname(remote), true);
      await sftp.fastPut(local, remote);
    },
    async rename(from, to) {
      if (await sftp.exists(to)) await sftp.delete(to);
      await sftp.rename(from, to);
    },
    async exists(remote) {
      return (await sftp.exists(remote)) !== false;
    },
    async read(remote) {
      if ((await sftp.exists(remote)) === false) return null;
      return ((await sftp.get(remote)) as Buffer).toString('utf8');
    },
    async close() {
      await sftp.end();
    },
  };
}

function checkLocalFile(): { products: number; bytes: number } {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(localFile, 'utf8'));
  } catch (err) {
    fail(
      `${path.relative(repoRoot, localFile)} is missing or not valid JSON (${err instanceof Error ? err.message : String(err)}). Run \`npm run products:sync\` first.`,
    );
  }
  const products: unknown = (json as { produkty?: unknown }).produkty;
  const count = Array.isArray(products) ? products.length : 0;
  if (count === 0) {
    fail('Products_Data.json has no "produkty" list. Nothing to push.');
  }
  return { products: count, bytes: statSync(localFile).size };
}

interface ImportResult {
  at: string;
  ok: boolean;
  created?: number;
  updated?: number;
  deactivated?: number;
  skipped?: string[];
  error?: string;
  meta?: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const config = loadConfig();
  const { products, bytes } = checkLocalFile();
  const importDir = path.posix.join(
    config.appDir,
    'Api_Php',
    'storage',
    'import',
  );
  const pending = path.posix.join(importDir, 'Pending_Products.json');
  const uploading = path.posix.join(importDir, 'Pending_Products.uploading');
  const resultFile = path.posix.join(importDir, 'Last_Import.json');

  console.log('\n=== DEMO PARTS katalog — products push ===');
  console.log(`  File:      ${path.relative(repoRoot, localFile)}`);
  console.log(`  Products:  ${products} (${(bytes / 1024).toFixed(0)} KB)`);
  console.log(`  Protocol:  ${config.protocol.toUpperCase()}`);
  console.log(`  Target:    ${pending}`);
  console.log(`  Site:      ${siteUrl}`);
  if (config.dryRun) {
    console.log('\nDry run finished — no connection was made.');
    return;
  }

  const started = new Date();
  const remote =
    config.protocol === 'sftp' ? await openSftp(config) : await openFtp(config);
  try {
    await remote.put(localFile, uploading);
    await remote.rename(uploading, pending);
    console.log('\nUploaded. Waking the API so it imports the file…');

    // Any request to the API runs the import. The host may answer scripts with a
    // bot-check page; then the import runs on the first real visit instead.
    await fetch(`${siteUrl}/api/health`).catch(() => undefined);

    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      if (!(await remote.exists(pending))) {
        const raw = await remote.read(resultFile);
        const result = raw ? (JSON.parse(raw) as ImportResult) : null;
        if (
          result &&
          new Date(result.at) >= new Date(started.getTime() - 5_000)
        ) {
          report(result);
          return;
        }
      }
      await sleep(POLL_MS);
      await fetch(`${siteUrl}/api/health`).catch(() => undefined);
    }
    console.log(
      `\nThe file is on the server but not imported yet (no API request reached PHP in ${WAIT_MS / 1000}s).`,
    );
    console.log(
      `It is imported on the first visit to ${siteUrl}. Open the site, then run this command again to see the result.`,
    );
    process.exitCode = 2;
  } finally {
    await remote.close();
  }
}

function report(result: ImportResult): void {
  if (!result.ok) {
    fail(
      `Import failed on the server: ${result.error ?? 'unknown error'} ${result.meta ? JSON.stringify(result.meta) : ''}`,
    );
  }
  console.log(`\nImported at ${result.at}:`);
  console.log(`  created:     ${result.created ?? 0}`);
  console.log(`  updated:     ${result.updated ?? 0}`);
  console.log(`  deactivated: ${result.deactivated ?? 0}`);
  console.log(`  skipped:     ${result.skipped?.length ?? 0}`);
  for (const reason of result.skipped ?? []) console.log(`    - ${reason}`);
}

main().catch((err: unknown) => {
  fail(
    `products push failed: ${err instanceof Error ? err.message : String(err)}`,
  );
});
