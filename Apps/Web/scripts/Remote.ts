// Shared by Deploy.ts and Products_Push.ts: the hosting connection settings from
// .env.deploy (git-ignored, names in .env.deploy.example). Values are never printed.
import process from 'node:process';

export type Protocol = 'sftp' | 'ftps' | 'ftp';

export interface Config {
  protocol: Protocol;
  host: string;
  port: number;
  user: string;
  password: string;
  webDir: string;
  appDir: string;
  dryRun: boolean;
}

export function fail(message: string): never {
  console.error(`[deploy] ${message}`);
  process.exit(1);
}

export function loadConfig(): Config {
  const dryRun = process.env.DEPLOY_DRY_RUN === 'true';
  const read = (name: string, required: boolean): string => {
    const value = process.env[name]?.trim() ?? '';
    if (!value && required && !dryRun) {
      fail(
        `Missing ${name}. Copy Apps/Web/.env.deploy.example to .env.deploy and fill it in.`,
      );
    }
    return value;
  };

  const protocol = (read('DEPLOY_PROTOCOL', false) || 'sftp') as Protocol;
  if (!['sftp', 'ftps', 'ftp'].includes(protocol)) {
    fail(`Invalid DEPLOY_PROTOCOL "${protocol}". Use sftp | ftps | ftp.`);
  }
  const portRaw = read('DEPLOY_PORT', false);
  const port = portRaw ? Number(portRaw) : protocol === 'sftp' ? 22 : 21;
  if (!Number.isInteger(port) || port <= 0)
    fail('DEPLOY_PORT must be a port number.');

  return {
    protocol,
    host: read('DEPLOY_HOST', true),
    port,
    user: read('DEPLOY_USER', true),
    password: read('DEPLOY_PASSWORD', true),
    webDir: read('DEPLOY_WEB_DIR', true) || 'public_html',
    appDir: read('DEPLOY_APP_DIR', true) || 'katalog_app',
    dryRun,
  };
}
