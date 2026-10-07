import { describe, expect, it } from 'vitest';
import { formatDateTime, formatNumber, localeFor } from '../src/i18n/format';

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;
const sample = Date.UTC(2026, 9, 7, 14, 30);

// FR-029: Western digits (0–9) in every language.
describe('formatting', () => {
  it('uses Western digits for Arabic numbers and dates', () => {
    const number = formatNumber(1234567.5, 'ar');
    const date = formatDateTime(sample, 'ar', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
    expect(number).toMatch(/1.?234.?567/);
    expect(number).not.toMatch(ARABIC_INDIC_DIGITS);
    expect(date).toMatch(/2026/);
    expect(date).not.toMatch(ARABIC_INDIC_DIGITS);
  });

  it('follows French and English conventions', () => {
    expect(formatNumber(1234.5, 'fr')).toMatch(/^1\s?234,5$/u);
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
    expect(formatDateTime(sample, 'fr', { dateStyle: 'long', timeZone: 'UTC' })).toBe('7 octobre 2026');
  });

  it('maps languages to locales', () => {
    expect(localeFor('ar')).toBe('ar-MA-u-nu-latn');
    expect(localeFor('fr-FR')).toBe('fr-FR');
    expect(localeFor('xx')).toBe('en-GB');
  });
});
