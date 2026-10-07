import { configurePasswordHashing, hashPassword } from '../src/auth/password';
import { ensureSetupCode } from '../src/auth/setup';
import { createApp } from '../src/app';
import { createTestClock, type TestClock } from '../src/clock';
import { loadConfig, type Config } from '../src/config';
import type Database from 'better-sqlite3';
import { openDb, runMigrations, type DB } from '../src/db/client';
import { silentLogger } from '../src/deps';
import { noGeo } from '../src/lib/geo';

export const TEST_ORIGIN = 'http://localhost:5173';
export const TEST_SETUP_CODE = 'TEST-SETUP-CODE';
export const OWNER = {
  setupCode: TEST_SETUP_CODE,
  username: 'hicham',
  displayName: 'Hicham Jabbar',
  password: 'Correct-Horse-Battery-9',
  language: 'en',
} as const;
export const DEFAULT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export interface TestResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
  setCookies: string[];
}

/** One browser/device: keeps its own cookies, IP and user agent. */
export class TestClient {
  readonly cookies = new Map<string, string>();

  constructor(
    private readonly app: ReturnType<typeof createApp>,
    public ip = '203.0.113.10',
    public userAgent = DEFAULT_UA,
  ) {}

  async request<T = any>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = {
      'user-agent': this.userAgent,
      'x-forwarded-for': this.ip,
      origin: TEST_ORIGIN,
      ...extraHeaders,
    };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = res.headers.getSetCookie();
    for (const raw of setCookies) {
      const [pair, ...attrs] = raw.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim())) || value === '';
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: res.status, body: parsed as T, headers: res.headers, setCookies } satisfies TestResponse<T>;
  }

  get = <T = any>(path: string) => this.request<T>('GET', path);
  post = <T = any>(path: string, body?: unknown) => this.request<T>('POST', path, body ?? {});
  patch = <T = any>(path: string, body?: unknown) => this.request<T>('PATCH', path, body ?? {});
  delete = <T = any>(path: string) => this.request<T>('DELETE', path);
}

export interface TestContext {
  app: ReturnType<typeof createApp>;
  db: DB;
  /** Raw SQLite handle, for asserting database-level guards directly. */
  sqlite: Database.Database;
  clock: TestClock;
  config: Config;
  client(ip?: string, userAgent?: string): TestClient;
  /** Run first-launch setup through the API; returns the Owner's signed-in client. */
  createOwner(client?: TestClient): Promise<TestClient>;
  /** Insert an active worker directly (feature 005 adds the real flow) and return a signed-in client. */
  createWorker(username?: string): Promise<TestClient>;
}

export async function createTestContext(env: Record<string, string> = {}): Promise<TestContext> {
  // Fast argon2 parameters keep the suite quick; production parameters are tested in unit/password.test.ts.
  configurePasswordHashing({ memoryCost: 1024, timeCost: 1 });
  const { db, sqlite } = openDb(':memory:');
  runMigrations(db);
  const clock = createTestClock();
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: TEST_ORIGIN,
    TRUST_PROXY: 'true',
    DATA_DIR: '.test-data',
    SETUP_CODE: TEST_SETUP_CODE,
    ...env,
  });
  await ensureSetupCode(db, config, silentLogger);
  const app = createApp({ db, clock, config, geo: noGeo, log: silentLogger });
  const client = (ip?: string, ua?: string) => new TestClient(app, ip, ua);

  const createOwner = async (c = client()) => {
    const res = await c.post('/api/setup', OWNER);
    if (res.status !== 201) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
    return c;
  };

  const createWorker = async (username = 'worker1') => {
    const now = clock.now();
    sqlite
      .prepare(
        `insert into users (id, username, username_normalized, display_name, password_hash, role, status, language,
           password_changed_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, 'worker', 'active', 'en', ?, ?, ?)`,
      )
      .run(`worker-${username}`, username, username, username, await hashPassword(OWNER.password), now, now, now);
    const c = client('198.51.100.20');
    const res = await c.post('/api/auth/sign-in', { username, password: OWNER.password });
    if (res.status !== 200) throw new Error(`worker sign-in failed: ${res.status}`);
    return c;
  };

  return { app, db, sqlite, clock, config, client, createOwner, createWorker };
}

/** Audit action codes, oldest first. */
export function auditActions(ctx: TestContext): string[] {
  return (ctx.sqlite.prepare('select action from audit_entries order by occurred_at, rowid').all() as { action: string }[]).map(
    (r) => r.action,
  );
}

// ── 002 seed helpers: create records through the API so every rule and audit entry applies ──

export async function seedCustomer(client: TestClient, overrides: Record<string, unknown> = {}) {
  // confirmDuplicate: seeds may reuse the default name; the duplicate warning has its own tests.
  const res = await client.post('/api/customers', {
    name: 'MJTR Gold',
    city: 'Casablanca',
    country: 'Morocco',
    confirmDuplicate: true,
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`seedCustomer failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function seedSupplier(client: TestClient, overrides: Record<string, unknown> = {}) {
  const res = await client.post('/api/suppliers', { name: 'Linyi Heavy Machinery', city: 'Linyi', ...overrides });
  if (res.status !== 201) throw new Error(`seedSupplier failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Default: "2 Doosan excavators", 190000 USD, items 2 × 85000 + 1 × 12500 (total 182500). */
export async function seedOrder(client: TestClient, overrides: Record<string, unknown> = {}) {
  const customerId = (overrides.customerId as string | undefined) ?? (await seedCustomer(client)).id;
  const res = await client.post('/api/orders', {
    title: '2 Doosan excavators',
    customerId,
    agreedPrice: '190000',
    currency: 'USD',
    incoterm: 'CIF',
    destinationPort: 'Casablanca',
    items: [
      { productName: 'Excavator', brandModel: 'Doosan DX225LC', year: 2021, quantity: 2, unitPrice: '85000' },
      { productName: 'Breaker hammer', quantity: 1, unitPrice: '12500' },
    ],
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`seedOrder failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
