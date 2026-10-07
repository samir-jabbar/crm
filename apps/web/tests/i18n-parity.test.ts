import { ERROR_CODES } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import ar from '../src/locales/ar/common.json';
import en from '../src/locales/en/common.json';
import fr from '../src/locales/fr/common.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const locales = { en: flatten(en as Tree), fr: flatten(fr as Tree), ar: flatten(ar as Tree) };

// SC-005: every user-visible text exists in English, French and Arabic.
describe('translations', () => {
  it('have identical keys in en, fr and ar', () => {
    const enKeys = Object.keys(locales.en).sort();
    expect(Object.keys(locales.fr).sort()).toEqual(enKeys);
    expect(Object.keys(locales.ar).sort()).toEqual(enKeys);
  });

  it('have no empty values', () => {
    for (const [lng, entries] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(entries)) {
        expect(value.trim(), `${lng}:${key}`).not.toBe('');
      }
    }
  });

  it('translate every API error code', () => {
    for (const code of ERROR_CODES) {
      for (const [lng, entries] of Object.entries(locales)) {
        expect(entries[`errors.${code}`], `${lng}: errors.${code}`).toBeDefined();
      }
    }
  });

  it('keep interpolation placeholders consistent', () => {
    const placeholders = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).sort();
    for (const [key, value] of Object.entries(locales.en)) {
      expect(placeholders(locales.fr[key]!), `fr:${key}`).toEqual(placeholders(value));
      expect(placeholders(locales.ar[key]!), `ar:${key}`).toEqual(placeholders(value));
    }
  });
});
