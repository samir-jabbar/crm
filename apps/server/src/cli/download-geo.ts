/**
 * Download the free DB-IP Lite City database (CC BY 4.0) used for the approximate location of sessions
 * and sign-ins (R17). Optional: without it, locations show as "Unknown". Re-run monthly to refresh.
 *
 *   npm run geo:download -w apps/server
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import maxmind, { type CityResponse } from 'maxmind';
import { loadConfig } from '../config';

function monthStamp(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function download(stamp: string): Promise<Buffer | null> {
  const url = `https://download.db-ip.com/free/dbip-city-lite-${stamp}.mmdb.gz`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return gunzipSync(Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const { geoDbPath } = loadConfig();
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  let data: Buffer | null = null;
  for (const stamp of [monthStamp(now), monthStamp(previous)]) {
    console.log(`[geo] Downloading DB-IP Lite City ${stamp}…`);
    data = await download(stamp);
    if (data) break;
  }
  if (!data) throw new Error('Could not download the DB-IP Lite City database.');

  mkdirSync(dirname(geoDbPath), { recursive: true });
  const tmp = `${geoDbPath}.tmp`;
  writeFileSync(tmp, data);
  await maxmind.open<CityResponse>(tmp); // verify it opens before replacing the current file
  renameSync(tmp, geoDbPath);
  console.log(`[geo] Saved ${geoDbPath}. Attribution: "IP geolocation by DB-IP" (https://db-ip.com).`);
}

main().catch((error: unknown) => {
  console.error(`[geo] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
