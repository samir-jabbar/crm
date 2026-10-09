import { permissionSetSchema, type OrderScope, type PermissionSet } from '@hanjing/shared';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { inject } from 'vitest';
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
  /** Set for clients made by `createWorker`. */
  userId?: string;

  constructor(
    private readonly app: ReturnType<typeof createApp>,
    public ip = '203.0.113.10',
    public userAgent = DEFAULT_UA,
  ) {}

  async request<T = any>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const isForm = body instanceof FormData;
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
    const { res, setCookies } = await this.send(method, path, {
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: res.status, body: parsed as T, headers: res.headers, setCookies } satisfies TestResponse<T>;
  }

  /** Raw response bytes (receipts). */
  async getBytes(path: string) {
    const { res } = await this.send('GET', path, { headers: {} });
    return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()), headers: res.headers };
  }

  /** Multipart upload with field `file`, like the phone's file input. */
  upload<T = any>(path: string, file: { bytes: Uint8Array; filename: string; type: string }) {
    const form = new FormData();
    form.append('file', new File([file.bytes as Uint8Array<ArrayBuffer>], file.filename, { type: file.type }));
    return this.request<T>('POST', path, form);
  }

  private async send(method: string, path: string, init: { headers: Record<string, string>; body?: string | FormData }) {
    const headers: Record<string, string> = {
      'user-agent': this.userAgent,
      'x-forwarded-for': this.ip,
      origin: TEST_ORIGIN,
      ...init.headers,
    };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await this.app.request(path, { method, headers, body: init.body });
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
    return { res, setCookies };
  }

  get = <T = any>(path: string) => this.request<T>('GET', path);
  post = <T = any>(path: string, body?: unknown) => this.request<T>('POST', path, body ?? {});
  put = <T = any>(path: string, body?: unknown) => this.request<T>('PUT', path, body ?? {});
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
  /**
   * Insert an approved, active worker directly and return a signed-in client (its `userId` is set). Without
   * permissions the worker has no access at all. 005 tests use the options; registration has its own tests.
   */
  createWorker(options?: string | WorkerOptions): Promise<TestClient>;
}

export interface WorkerOptions {
  username?: string;
  permissions?: PermissionSet;
  orderScope?: OrderScope;
  ownEntriesOnly?: boolean;
  customerIds?: string[];
  assignedOrderIds?: string[];
  accessEndsOn?: string | null;
  templateId?: string;
}

/** A fresh data directory under the run's root (tests/globalSetup.ts removes it afterwards). */
const tempDataDir = () => mkdtempSync(join(inject('dataRoot'), 'ctx-'));

/** Outbound HTTP is off in tests unless a test passes a fake (e.g. `fakeRates().http`). */
const noNetwork: typeof fetch = () => Promise.reject(new Error('network disabled in tests'));

export async function createTestContext(
  env: Record<string, string> = {},
  options: { http?: typeof fetch } = {},
): Promise<TestContext> {
  // Fast argon2 parameters keep the suite quick; production parameters are tested in unit/password.test.ts.
  configurePasswordHashing({ memoryCost: 1024, timeCost: 1 });
  const { db, sqlite } = openDb(':memory:');
  runMigrations(db);
  const clock = createTestClock();
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: TEST_ORIGIN,
    TRUST_PROXY: 'true',
    // Each context gets its own data directory, so stored receipts never collide between tests.
    DATA_DIR: tempDataDir(),
    SETUP_CODE: TEST_SETUP_CODE,
    ...env,
  });
  await ensureSetupCode(db, config, silentLogger);
  const app = createApp({ db, clock, config, geo: noGeo, log: silentLogger, http: options.http ?? noNetwork });
  const client = (ip?: string, ua?: string) => new TestClient(app, ip, ua);

  const createOwner = async (c = client()) => {
    const res = await c.post('/api/setup', OWNER);
    if (res.status !== 201) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
    return c;
  };

  const createWorker = async (options: string | WorkerOptions = {}) => {
    const o: WorkerOptions = typeof options === 'string' ? { username: options } : options;
    const username = o.username ?? 'worker1';
    const id = `worker-${username}`;
    const now = clock.now();
    const permissions = o.permissions ? JSON.stringify(permissionSetSchema.parse(o.permissions)) : null;
    sqlite
      .prepare(
        `insert into users (id, username, username_normalized, display_name, password_hash, role, status, language,
           password_changed_at, created_at, updated_at, permissions, order_scope, own_entries_only, access_ends_on, template_id)
         values (?, ?, ?, ?, ?, 'worker', 'active', 'en', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        username,
        username.toLowerCase(),
        username,
        await hashPassword(OWNER.password),
        now,
        now,
        now,
        permissions,
        o.orderScope ?? 'all',
        o.ownEntriesOnly ? 1 : 0,
        o.accessEndsOn ?? null,
        o.templateId ?? null,
      );
    for (const customerId of o.customerIds ?? []) {
      sqlite.prepare('insert into user_customers (user_id, customer_id) values (?, ?)').run(id, customerId);
    }
    for (const orderId of o.assignedOrderIds ?? []) {
      sqlite.prepare('insert into order_assignments (order_id, user_id, assigned_at) values (?, ?, ?)').run(orderId, id, now);
    }
    const c = client('198.51.100.20');
    const res = await c.post('/api/auth/sign-in', { username, password: OWNER.password });
    if (res.status !== 200) throw new Error(`worker sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
    c.userId = id;
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

/** Default: "2 Doosan excavators", 190000 USD at an agreed 7.1, items 2 × 85000 + 1 × 12500 (total 182500). */
export async function seedOrder(client: TestClient, overrides: Record<string, unknown> = {}) {
  const customerId = (overrides.customerId as string | undefined) ?? (await seedCustomer(client)).id;
  const res = await client.post('/api/orders', {
    title: '2 Doosan excavators',
    customerId,
    agreedPrice: '190000',
    currency: 'USD',
    agreedRate: '7.1',
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

// ── 003 helpers: expenses, receipts and a fake rate provider ───────────────

// ── 004 helpers ─────────────────────────────────────────────────────────────

/** Default: a Bank balance of 1000 USD on 2026-10-07, at USD 7.1 and MAD 0.71 typed by hand. */
export async function seedPayment(client: TestClient, orderId: string, overrides: Record<string, unknown> = {}) {
  const res = await client.post(`/api/orders/${orderId}/payments`, {
    channel: 'bank',
    type: 'balance',
    amount: '1000',
    currency: 'USD',
    paymentDate: '2026-10-07',
    rates: { USD: '7.1', MAD: '0.71', EUR: null },
    rateSource: 'manual',
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`seedPayment failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Default: "Trucking Linyi to Qingdao port", inland transport, 3500 CNY on 2026-10-07 (the test clock's day). */
export async function seedExpense(client: TestClient, orderId: string, overrides: Record<string, unknown> = {}) {
  const res = await client.post(`/api/orders/${orderId}/expenses`, {
    name: 'Trucking Linyi to Qingdao port',
    categoryId: 'cat-inland_transport_china',
    amount: '3500',
    currency: 'CNY',
    expenseDate: '2026-10-07',
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`seedExpense failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const fromBase64 = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));
/** Minimal valid files for upload tests. */
export const TINY_JPEG = fromBase64(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
);
export const TINY_PNG = fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
export const TINY_PDF = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

type FakeCurrency = 'USD' | 'MAD' | 'EUR';
export interface FakeRatesState {
  /** Published rates per date ("1 unit = X CNY"). The newest date is what "latest" returns. */
  dates: Record<string, Record<FakeCurrency, string>>;
  /** ok; down = network error; hang = never answers (until aborted); primaryDown = only the jsDelivr host fails. */
  mode: 'ok' | 'down' | 'hang' | 'primaryDown';
  /** Answer every call with this HTTP status instead (e.g. 429). */
  status?: number;
}

/**
 * A fake rate provider for `createTestContext({}, { http })`. It answers the Currency API (jsDelivr and pages.dev)
 * and open.er-api URLs the way the real services do, with rates quoted "1 CNY = x foreign", and records every call.
 */
export function fakeRates(initial: Partial<FakeRatesState> = {}) {
  const state: FakeRatesState = {
    dates: { '2026-10-07': { USD: '7.1', MAD: '0.71', EUR: '7.8' } },
    mode: 'ok',
    ...initial,
  };
  const calls: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const quoted = (rates: Record<FakeCurrency, string>, lower: boolean) =>
    Object.fromEntries(Object.entries(rates).map(([c, r]) => [lower ? c.toLowerCase() : c, 1 / Number(r)]));
  const newest = () => Object.keys(state.dates).sort().at(-1)!;

  const http: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (state.mode === 'down' || (state.mode === 'primaryDown' && url.includes('cdn.jsdelivr.net'))) {
      throw new TypeError('fetch failed');
    }
    if (state.mode === 'hang') {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    }
    if (state.status) return json({ result: 'error' }, state.status);
    if (url.includes('open.er-api.com')) {
      const date = newest();
      return json({
        result: 'success',
        time_last_update_unix: Date.parse(`${date}T00:02:31Z`) / 1000,
        base_code: 'CNY',
        rates: { CNY: 1, ...quoted(state.dates[date]!, false) },
      });
    }
    const requested = /currency-api@([^/]+)\//.exec(url)?.[1] ?? /\/\/([^.]+)\.currency-api\.pages\.dev/.exec(url)?.[1];
    if (!requested) return json({ error: 'unknown url' }, 404);
    const date = requested === 'latest' ? newest() : requested;
    const rates = state.dates[date];
    if (!rates) return new Response('Not found', { status: 404 });
    return json({ date, cny: { cny: 1, ...quoted(rates, true) } });
  };
  return { http, calls, state };
}
