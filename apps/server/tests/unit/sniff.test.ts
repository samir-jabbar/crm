import { describe, expect, it } from 'vitest';
import { sniffMime } from '../../src/files/sniff';
import { TINY_JPEG, TINY_PDF, TINY_PNG } from '../helpers';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...new TextEncoder().encode(p)] : p)));

// 003 research R7 / FR-006: the type comes from the bytes, never from the file name.
describe('sniffMime', () => {
  it('recognizes the accepted receipt types', () => {
    expect(sniffMime(TINY_JPEG)).toBe('image/jpeg');
    expect(sniffMime(TINY_PNG)).toBe('image/png');
    expect(sniffMime(TINY_PDF)).toBe('application/pdf');
    expect(sniffMime(bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '))).toBe('image/webp');
    for (const brand of ['heic', 'heix', 'mif1', 'msf1', 'hevc']) {
      expect(sniffMime(bytes([0, 0, 0, 0x18], 'ftyp', brand, [0, 0, 0, 0])), brand).toBe('image/heic');
    }
  });

  it('refuses everything else', () => {
    const refused = {
      gif: bytes('GIF89a', [1, 0, 1, 0]),
      svg: bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      xml: bytes('<?xml version="1.0"?><svg/>'),
      html: bytes('<!doctype html><script>alert(1)</script>'),
      zip: bytes([0x50, 0x4b, 0x03, 0x04], 'word/document.xml'),
      exe: bytes('MZ', [0x90, 0, 3, 0]),
      mp4: bytes([0, 0, 0, 0x18], 'ftypisom', [0, 0, 0, 0]),
      riffWav: bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '),
      empty: new Uint8Array(),
      short: bytes([0xff, 0xd8]),
    };
    for (const [name, b] of Object.entries(refused)) expect(sniffMime(b), name).toBeNull();
  });
});
