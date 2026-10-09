import type { ReceiptMime } from '@hanjing/shared';

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);

/** ISO-BMFF brands of HEIC/HEIF still images (phones' default camera format). */
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/**
 * The receipt type, read from the file's magic bytes only (003 research R7). The file name and the type the
 * client claims are ignored, so a renamed HTML or SVG file can never be stored or served as an image.
 */
export function sniffMime(bytes: Uint8Array): ReceiptMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(bytes, 8, 12))) return 'image/heic';
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
