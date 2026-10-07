import type { Clock } from './clock';
import type { Config } from './config';
import type { DB } from './db/client';
import type { GeoLookup } from './lib/geo';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m, e) => console.error(m, e ?? ''),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

/** Everything a route or service needs, injected once in createApp (tests swap clock/db/log). */
export interface Deps {
  db: DB;
  clock: Clock;
  config: Config;
  geo: GeoLookup;
  log: Logger;
}
