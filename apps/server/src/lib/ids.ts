import { randomBytes } from 'node:crypto';

let lastMs = 0;
let counter = 0;

/**
 * UUIDv7 (RFC 9562) with a monotonic 12-bit counter in `rand_a`: ids sort by creation order, even within
 * the same millisecond. Lists ordered by (timestamp, id) — audit log, sign-in history — stay stable.
 */
export function newId(now: number = Date.now()): string {
  if (now > lastMs) {
    lastMs = now;
    counter = 0;
  } else {
    counter += 1;
    if (counter > 0xfff) {
      lastMs += 1; // borrow the next millisecond rather than lose ordering
      counter = 0;
    }
  }
  const bytes = randomBytes(16);
  const ms = BigInt(lastMs);
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f); // version 7 + counter high bits
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f); // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
