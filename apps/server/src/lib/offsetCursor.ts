import { AppError } from './errors';

/** Opaque offset cursor for small name-sorted lists (customers, suppliers — research R9). */
export function encodeOffset(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

export function decodeOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const match = /^o:(\d{1,9})$/.exec(text);
  if (!match) throw new AppError(400, 'validation_failed', { fields: { cursor: 'invalid_value' } });
  return Number(match[1]);
}
