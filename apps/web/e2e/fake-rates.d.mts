import type { Server } from 'node:http';

/** Types for fake-rates.mjs (plain JavaScript so that start-server.mjs can run it without a build step). */
export declare const FAKE_RATES_PORT: number;
export declare const FAKE_RATES_URLS: { RATES_CURRENCY_API_URLS: string; RATES_EXCHANGERATE_API_URL: string };
export declare function startFakeRates(): Server;
export declare function setFakeRatesMode(mode: 'ok' | 'down'): Promise<void>;
