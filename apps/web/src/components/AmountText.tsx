import type { CurrencyCode } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/i18n/format';
import { cn } from '@/lib/utils';

/**
 * Display a decimal-string amount ("182500.00") in the current language, always with Western digits (FR-029).
 * Formatting only — all arithmetic happens in integer minor units elsewhere.
 */
export function formatMoney(value: string, currency: CurrencyCode, lng: string, signed = false): string {
  return new Intl.NumberFormat(localeFor(lng), {
    style: 'currency',
    currency,
    numberingSystem: 'latn',
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(Number(value));
}

export function AmountText({
  value,
  currency,
  signed = false,
  className,
}: {
  value: string;
  currency: CurrencyCode;
  signed?: boolean;
  className?: string;
}) {
  const { i18n } = useTranslation();
  return (
    <bdi dir="ltr" className={cn('whitespace-nowrap tabular-nums', className)}>
      {formatMoney(value, currency, i18n.language, signed)}
    </bdi>
  );
}
