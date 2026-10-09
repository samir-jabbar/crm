// A local stand-in for the rate providers, so E2E runs never reach the real ones (003 T050).
// It answers in the providers' own formats, quoting "1 CNY = x foreign" like they do.
import { createServer } from 'node:http';

export const FAKE_RATES_PORT = 3199;
export const FAKE_RATES_URLS = {
  RATES_CURRENCY_API_URLS: `http://localhost:${FAKE_RATES_PORT}/currency-api/{date}/cny.json`,
  RATES_EXCHANGERATE_API_URL: `http://localhost:${FAKE_RATES_PORT}/er-api/latest/CNY`,
};

const RATES = { USD: 7.1, MAD: 0.71, EUR: 7.8 };
const today = () => new Date().toISOString().slice(0, 10);
const quoted = (lower) => Object.fromEntries(Object.entries(RATES).map(([c, r]) => [lower ? c.toLowerCase() : c, 1 / r]));

/** Starts the fake. `POST /__mode` with `{ "mode": "ok" | "down" }` switches it; "down" drops every request. */
export function startFakeRates() {
  let mode = 'ok';
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${FAKE_RATES_PORT}`);
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'POST' && url.pathname === '/__mode') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        mode = JSON.parse(body || '{}').mode === 'down' ? 'down' : 'ok';
        json(200, { mode });
      });
      return;
    }
    if (mode === 'down') return req.socket.destroy();
    const dated = /^\/currency-api\/([^/]+)\/cny\.json$/.exec(url.pathname);
    if (dated) {
      const date = dated[1] === 'latest' ? today() : dated[1];
      // Like the real service, it has no rates for dates it never published (here: before 2026).
      if (date < '2026-01-01') return json(404, { error: 'not found' });
      return json(200, { date, cny: { cny: 1, ...quoted(true) } });
    }
    if (url.pathname === '/er-api/latest/CNY') {
      return json(200, {
        result: 'success',
        time_last_update_unix: Math.floor(Date.parse(`${today()}T00:02:31Z`) / 1000),
        base_code: 'CNY',
        rates: { CNY: 1, ...quoted(false) },
      });
    }
    json(404, { error: 'unknown' });
  });
  server.listen(FAKE_RATES_PORT);
  return server;
}

/** From a test: make the fake rate provider fail or work again. */
export async function setFakeRatesMode(mode) {
  const res = await fetch(`http://localhost:${FAKE_RATES_PORT}/__mode`, { method: 'POST', body: JSON.stringify({ mode }) });
  if (!res.ok) throw new Error(`fake rates: ${res.status}`);
}
