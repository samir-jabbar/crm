import type { ExpenseStatus } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/i18n/format';

/** Paid = calm, to pay = needs attention. */
export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  const { t } = useTranslation();
  return <Badge tone={status === 'to_pay' ? 'warning' : 'success'}>{t(`expenseStatus.${status}`)}</Badge>;
}

/** A calendar date (`YYYY-MM-DD`) in the user's language, with Western digits. */
export function CalendarDate({ value }: { value: string }) {
  const { i18n } = useTranslation();
  return <bdi>{formatDateTime(`${value}T00:00:00`, i18n.language, { dateStyle: 'medium' })}</bdi>;
}

/** Paper-clip marker for an expense with a receipt, labelled for screen readers. */
export function ReceiptMarker() {
  const { t } = useTranslation();
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" role="img" aria-label={t('expenses.hasReceipt')}>
      <title>{t('expenses.hasReceipt')}</title>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
