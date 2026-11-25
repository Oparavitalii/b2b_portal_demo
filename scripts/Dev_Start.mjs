#!/usr/bin/env node
// npm run dev — starts the whole catalogue locally.
// 1. When the SQLite database is missing: Migrate + Seed (+ product import when
//    Apps/Api_Php/database/Import_Products.php and storage/import/Products_Data.json exist).
// 2. Starts the API (php -S 127.0.0.1:8080) and the Vite dev server (proxy /api → API).
// Ctrl+C stops both; if either exits, the other is stopped too.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = path.join(root, 'Apps', 'Api_Php');
const php = process.env.PHP_BIN || 'php';
// API_PORT / WEB_PORT override the defaults (8080 / 5173); vite.config.ts reads both.
const apiHost = `127.0.0.1:${process.env.API_PORT || 8080}`;

function dbPath() {
  const fromEnv = process.env.DB_PATH;
  if (!fromEnv) return path.join(api, 'storage', 'katalog.sqlite');
  return path.isAbsolute(fromEnv) ? fromEnv : path.join(api, fromEnv);
}

function runPhp(script) {
  console.log(`[dev] php ${path.relative(root, script)}`);
  const r = spawnSync(php, [script], { cwd: api, stdio: 'inherit' });
  if (r.error) {
    console.error(`[dev] cannot run "${php}": ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`[dev] ${path.basename(script)} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(dbPath())) {
  console.log(`[dev] database not found (${dbPath()}) — building it`);
  runPhp(path.join(api, 'database', 'Migrate.php'));
  runPhp(path.join(api, 'database', 'Seed.php'));
  const importer = path.join(api, 'database', 'Import_Products.php');
  const json = path.join(api, 'storage', 'import', 'Products_Data.json');
  if (existsSync(importer) && existsSync(json)) {
    runPhp(importer);
  } else {
    console.log(
      '[dev] no product import (run `npm run products:sync` to copy Products_Data.json)',
    );
  }
}

const children = [];
let stopping = false;

function start(label, command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  child.on('error', (err) => {
    console.error(`[dev] ${label} failed to start: ${err.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.log(`[dev] ${label} exited (${signal ?? code}) — stopping`);
      stop(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.killed) continue;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGINT');
    }
  }
  process.exitCode = code;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log(`[dev] API  → http://${apiHost} (via the web app at /api)`);
start(
  'api',
  php,
  ['-S', apiHost, '-t', 'public', path.join('public', 'index.php')],
  { cwd: api },
);
start('web', 'npm', ['run', 'dev', '-w', '@catalog/web'], {
  cwd: root,
  shell: process.platform === 'win32',
});
