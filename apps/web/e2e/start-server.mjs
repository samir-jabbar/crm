// Builds the web app and starts the API server in production mode on a fresh data directory for E2E runs.
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const repoRoot = resolve(webDir, '..', '..');
const dataDir = resolve(repoRoot, '.e2e-data');

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

execSync('npm run build', { cwd: webDir, stdio: 'inherit' });

const server = spawn('npm run start -w @hanjing/server', {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '3100',
    APP_ORIGIN: 'http://localhost:3100',
    DATA_DIR: dataDir,
    SETUP_CODE: 'E2E-SETUP-CODE',
    TRUST_PROXY: 'false',
  },
});

const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
