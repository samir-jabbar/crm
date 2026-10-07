import { existsSync } from 'node:fs';
import maxmind, { type CityResponse, type Reader } from 'maxmind';

/** Approximate location lookup, done locally from the optional DB-IP Lite City database (no network calls). */
export interface GeoLookup {
  lookup(ip: string): string | null;
}

export const noGeo: GeoLookup = { lookup: () => null };

const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80:|unknown$)/i;

export async function createGeoLookup(dbPath: string): Promise<GeoLookup> {
  if (!existsSync(dbPath)) return noGeo;
  let reader: Reader<CityResponse>;
  try {
    reader = await maxmind.open<CityResponse>(dbPath);
  } catch {
    return noGeo;
  }
  return {
    lookup(ip) {
      if (!ip || PRIVATE_IP.test(ip) || !maxmind.validate(ip)) return null;
      try {
        const hit = reader.get(ip);
        if (!hit) return null;
        const city = hit.city?.names?.en;
        const country = hit.country?.iso_code;
        if (city && country) return `${city}, ${country}`;
        return country ?? null;
      } catch {
        return null;
      }
    },
  };
}
