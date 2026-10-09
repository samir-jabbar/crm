import type { CurrencyCode } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/components/AmountText';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

/**
 * 004 FR-022 (brief §6): closing an order that is still owed money needs an explicit confirmation, showing how
 * much remains. Cancelling leaves the status as it was.
 */
export function CloseOrderDialog({
  outstanding,
  pending,
  onConfirm,
  onCancel,
}: {
  outstanding: { remaining: string; currency: CurrencyCode } | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Dialog open={outstanding !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      {outstanding ? (
        <DialogContent
          title={t('orders.close.title')}
          description={t('orders.close.body', { amount: formatMoney(outstanding.remaining, outstanding.currency, i18n.language) })}
        >
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </DialogClose>
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {t('orders.close.confirm')}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
