// Deploy of the DEMO PARTS catalogue to shared hosting (portal.catalog-demo.example) — see private hosting notes.
//   npm run deploy -w @catalog/web       build + upload
//   npm run deploy:dry -w @catalog/web   build + list the planned uploads, no connection
// Credentials: Apps/Web/.env.deploy (git-ignored, names in .env.deploy.example), loaded by
// `tsx --env-file`; values are never printed. Order: API code → DEPLOY_APP_DIR/Api_Php
// (outside the web root), then dist/ + deploy/public_html → DEPLOY_WEB_DIR, index.html LAST.
// storage/ (SQLite, backups, mail.log) and any .env file are never uploaded.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';

import { type Config, fail, loadConfig } from './Remote';

type Upload = { local: string; remote: string };

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(webRoot, '..', '..');
const distDir = path.join(webRoot, 'dist');
const apiDir = path.join(repoRoot, 'Apps', 'Api_Php');
const docrootExtras = path.join(repoRoot, 'deploy', 'public_html');

/** Folders of Apps/Api_Php that the server needs (tests, storage, package.json stay home). */
const API_FOLDERS = ['src', 'vendor', 'templates', 'database', 'scripts'];
/** Never uploaded, wherever they appear. */
const FORBIDDEN = [
  /(^|\/)storage(\/|$)/,
  /(^|\/)\.env(\.|$)/,
  /\.(sqlite|sqlite-wal|sqlite-shm|log)$/,
];

/** All files under dir, as POSIX paths relative to dir. */
async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else if (entry.isFile())
      out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

async function requireDir(dir: string, hint: string): Promise<void> {
  const s = await stat(dir).catch(() => null);
  if (!s?.isDirectory())
    fail(`${path.relative(repoRoot, dir)} not found. ${hint}`);
}

function isForbidden(rel: string): boolean {
  return FORBIDDEN.some((re) => re.test(rel));
}

async function plan(config: Config): Promise<Upload[]> {
  await requireDir(distDir, 'Run `npm run build` first.');
  await requireDir(apiDir, 'The API source is missing.');
  await requireDir(docrootExtras, 'deploy/public_html is missing.');

  const api: Upload[] = [
    {
      local: path.join(apiDir, 'public', 'index.php'),
      remote: 'public/index.php',
    },
  ];
  for (const folder of API_FOLDERS) {
    for (const rel of await walk(path.join(apiDir, folder))) {
      api.push({
        local: path.join(apiDir, folder, rel),
        remote: `${folder}/${rel}`,
      });
    }
  }

  // dist/.htaccess (from Apps/Web/public) is replaced by deploy/public_html/.htaccess,
  // which also routes /api/* to api/index.php.
  const dist = (await walk(distDir)).filter((rel) => rel !== '.htaccess');
  if (!dist.includes('index.html'))
    fail('dist/index.html missing. Did the build complete?');
  const web: Upload[] = [
    ...dist
      .filter((rel) => rel !== 'index.html')
      .map((rel) => ({ local: path.join(distDir, rel), remote: rel })),
    ...(await walk(docrootExtras)).map((rel) => ({
      local: path.join(docrootExtras, rel),
      remote: rel,
    })),
    { local: path.join(distDir, 'index.html'), remote: 'index.html' },
  ];

  const all = [
    ...api.map((u) => ({
      ...u,
      remote: path.posix.join(config.appDir, 'Api_Php', u.remote),
    })),
    ...web.map((u) => ({
      ...u,
      remote: path.posix.join(config.webDir, u.remote),
    })),
  ];
  const blocked = all.filter((u) => isForbidden(u.remote));
  if (blocked.length > 0) {
    fail(`Refusing to upload: ${blocked.map((u) => u.remote).join(', ')}`);
  }
  return all;
}

async function uploadSftp(config: Config, files: Upload[]): Promise<void> {
  const sftp = new SftpClient();
  await sftp.connect({
    host: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    readyTimeout: 15_000,
  });
  try {
    const ensured = new Set<string>();
    for (const [i, file] of files.entries()) {
      const dir = path.posix.dirname(file.remote);
      if (!ensured.has(dir)) {
        await sftp.mkdir(dir, true);
        ensured.add(dir);
      }
      console.log(`  [${i + 1}/${files.length}] ${file.remote}`);
      await sftp.fastPut(file.local, file.remote);
    }
  } finally {
    await sftp.end();
  }
}

/** Attempts per file; the host's passive data ports time out now and then. */
const FTP_ATTEMPTS = 4;

async function uploadFtp(config: Config, files: Upload[]): Promise<void> {
  let ftp = new FtpClient(30_000);
  let home = '';
  const connect = async (): Promise<void> => {
    ftp.close();
    ftp = new FtpClient(30_000);
    await ftp.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.protocol === 'ftps',
      // Shared hosts often present a self-signed certificate on the data channel.
      secureOptions: { rejectUnauthorized: false },
    });
    home = await ftp.pwd();
  };
  try {
    await connect();
    for (const [i, file] of files.entries()) {
      console.log(`  [${i + 1}/${files.length}] ${file.remote}`);
      for (let attempt = 1; ; attempt++) {
        try {
          await ftp.cd(home);
          await ftp.ensureDir(path.posix.dirname(file.remote));
          await ftp.uploadFrom(file.local, path.posix.basename(file.remote));
          break;
        } catch (err) {
          if (attempt >= FTP_ATTEMPTS) throw err;
          const reason = err instanceof Error ? err.message : String(err);
          console.log(`    retry ${attempt}/${FTP_ATTEMPTS - 1}: ${reason}`);
          await new Promise((r) => setTimeout(r, 2_000 * attempt));
          await connect();
        }
      }
    }
  } finally {
    ftp.close();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const started = Date.now();

  console.log('\n=== DEMO PARTS katalog — deploy ===');
  console.log(`  Protocol:  ${config.protocol.toUpperCase()}`);
  console.log(`  Host:      ${config.host || '(not set)'}:${config.port}`);
  console.log(`  Web root:  ${config.webDir}`);
  console.log(`  App dir:   ${config.appDir}/Api_Php`);
  console.log(
    `  Dry run:   ${config.dryRun ? 'YES — nothing is uploaded, no connection' : 'no'}\n`,
  );

  const files = await plan(config);
  console.log(`${files.length} files (API first, index.html last):`);

  if (config.dryRun) {
    for (const [i, file] of files.entries()) {
      console.log(
        `  [${i + 1}/${files.length}] ${file.remote} (dry-run, not uploaded)`,
      );
    }
    console.log('\nDry run finished — no connection was made.');
    return;
  }

  if (config.protocol === 'sftp') await uploadSftp(config, files);
  else await uploadFtp(config, files);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\nDeploy complete in ${seconds}s. Check https://portal.catalog-demo.example/api/health`,
  );
}

main().catch((err: unknown) => {
  fail(`failed: ${err instanceof Error ? err.message : String(err)}`);
});
