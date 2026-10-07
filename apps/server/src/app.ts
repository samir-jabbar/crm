import { relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { ErrorCode } from '@hanjing/shared';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { clearSessionCookie, readSessionCookie, validateSessionToken } from './auth/sessions';
import type { Deps } from './deps';
import type { AppEnv } from './env';
import { AppError } from './lib/errors';
import { buildRequestCtx } from './lib/requestContext';
import { assertAllApiRoutesHavePolicy, route } from './policy/route';
import { registerRoutes } from './routes';

const UNSAFE_METHOD = /^(POST|PUT|PATCH|DELETE)$/;
const DB_GUARD_CODES: ReadonlySet<ErrorCode> = new Set(['owner_protected', 'audit_append_only']);

/** Messages raised by the SQLite triggers (possibly wrapped by Drizzle). */
function databaseGuardCode(err: unknown): ErrorCode | null {
  let current: unknown = err;
  for (let depth = 0; depth < 3 && current instanceof Error; depth++) {
    for (const code of DB_GUARD_CODES) if (current.message.includes(code)) return code;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return null;
}

export function createApp(deps: Deps) {
  const { config, db, clock, log } = deps;
  const app = new Hono<AppEnv>();

  // Everything comes from this origin (D5): no CDNs, no Google, no third-party scripts.
  // 'unsafe-inline' styles are needed for React/Radix style attributes only.
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );

  // CSRF (R5): state-changing requests must come from an allowed origin. Browsers always send
  // Origin / Sec-Fetch-Site on these; together with SameSite=Lax cookies this blocks cross-site use.
  app.use('/api/*', async (c, next) => {
    if (UNSAFE_METHOD.test(c.req.method)) {
      const site = c.req.header('sec-fetch-site');
      const origin = c.req.header('origin');
      const sameOrigin = new URL(c.req.url).origin;
      if (site && site !== 'same-origin' && site !== 'none') throw new AppError(403, 'csrf_rejected');
      if (origin && origin !== sameOrigin && !config.appOrigins.includes(origin)) {
        throw new AppError(403, 'csrf_rejected');
      }
    }
    await next();
  });

  // Request context + session (FR-013): every /api request is resolved to a user or to nobody.
  app.use('/api/*', async (c, next) => {
    c.set('reqCtx', buildRequestCtx(c, config.trustProxy, deps.geo));
    c.set('user', null);
    c.set('session', null);
    const token = readSessionCookie(c);
    if (token) {
      const valid = validateSessionToken(db, clock, token);
      if (valid) {
        c.set('user', valid.user);
        c.set('session', valid.session);
      } else {
        clearSessionCookie(c, config);
      }
    }
    await next();
  });

  route(app, 'GET', '/api/health', 'public', (c) => c.json({ status: 'ok' }));
  registerRoutes(app, deps);

  app.onError((err, c) => {
    if (err instanceof AppError) {
      if (err.details?.retryAfterSeconds) c.header('Retry-After', String(err.details.retryAfterSeconds));
      const body = { error: { code: err.code, ...(err.details ? { details: err.details } : {}) } };
      return c.json(body, err.status as ContentfulStatusCode);
    }
    const guard = databaseGuardCode(err);
    if (guard) return c.json({ error: { code: guard } }, 409);
    if (err instanceof HTTPException) return err.getResponse();
    log.error(`[error] ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: { code: 'internal_error' } }, 500);
  });

  app.notFound((c) =>
    c.req.path.startsWith('/api/') ? c.json({ error: { code: 'not_found' } }, 404) : c.text('Not found', 404),
  );

  if (config.serveWeb) {
    // Built PWA from the same origin (R2). Shell files must revalidate; hashed assets are immutable.
    const root = (relative(process.cwd(), config.webDistDir) || '.').replaceAll('\\', '/');
    const assets = serveStatic<AppEnv>({ root });
    const spaFallback = serveStatic<AppEnv>({ root, path: 'index.html' });
    app.get('*', async (c, next) => {
      if (c.req.path.startsWith('/api/')) return next();
      await next();
      const p = c.req.path;
      if (p.startsWith('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
      else c.header('Cache-Control', 'no-cache');
    });
    app.get('*', (c, next) => (c.req.path.startsWith('/api/') ? next() : assets(c, next)));
    app.get('*', (c, next) => (c.req.path.startsWith('/api/') ? next() : spaFallback(c, next)));
  }

  assertAllApiRoutesHavePolicy(app);
  return app;
}

export type App = ReturnType<typeof createApp>;
