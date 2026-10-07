import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { deviceLabelFromUserAgent } from './device';
import type { GeoLookup } from './geo';

/** Who/where a request comes from — stored on sessions, sign-in attempts and audit entries. */
export interface RequestCtx {
  ip: string;
  userAgent: string;
  deviceLabel: string;
  location: string | null;
}

export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for');
    const first = forwarded?.split(',')[0]?.trim();
    if (first) return first;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    // app.request() in tests has no socket.
    return 'unknown';
  }
}

export function buildRequestCtx(c: Context, trustProxy: boolean, geo: GeoLookup): RequestCtx {
  const ip = clientIp(c, trustProxy);
  const userAgent = (c.req.header('user-agent') ?? '').slice(0, 512);
  return {
    ip,
    userAgent,
    deviceLabel: deviceLabelFromUserAgent(userAgent),
    location: geo.lookup(ip),
  };
}

/** Context for actions that do not come from an HTTP request (server CLI). */
export const SYSTEM_CTX: RequestCtx = { ip: 'local', userAgent: 'cli', deviceLabel: 'Server console', location: null };
