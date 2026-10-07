/**
 * Locale-aware formatting. Numbers and amounts always use Western digits (0–9) in every language (FR-029),
 * so the Arabic locale is pinned to the Latin numbering system.
 */
const LOCALES: Record<string, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  ar: 'ar-MA-u-nu-latn',
};

export function localeFor(lng: string): string {
  return LOCALES[lng.slice(0, 2)] ?? 'en-GB';
}

export function formatDateTime(
  value: string | number | Date,
  lng: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(localeFor(lng), { ...options, numberingSystem: 'latn' }).format(new Date(value));
}

export function formatNumber(value: number, lng: string, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(localeFor(lng), { ...options, numberingSystem: 'latn' }).format(value);
}
