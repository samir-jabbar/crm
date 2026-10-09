import type { Order } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AmountText } from '@/components/AmountText';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/i18n/format';
import { cn } from '@/lib/utils';

function Figure({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  );
}

/** "10.8" → "10.8 %" in the user's language, Western digits. */
function Percent({ value }: { value: string }) {
  const { i18n } = useTranslation();
  return (
    <bdi dir="ltr" className="tabular-nums">
      {formatNumber(Number(value) / 100, i18n.language, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </bdi>
  );
}

/**
 * 003 FR-012 / FR-013: the order's costs and profit, all in CNY. Updated as soon as an expense changes,
 * because every expense mutation invalidates the order (SC-006).
 */
export function FinancialSummary({ order }: { order: Order }) {
  const { t } = useTranslation();
  const f = order.financials;
  // 005 FR-027: a figure the viewer may not see is simply absent; the card shows what remains.
  const shown = (value: unknown) => value !== undefined;
  const overBudget = f.budgetUsedPercent != null && Number(f.budgetUsedPercent) > 100;
  const loss = f.profit != null && f.profit.startsWith('-');
  const costs = [f.agreedPriceCny, f.expensesTotal, f.unpaid, f.profit, f.marginPercent, f.budgetUsedPercent].some(shown);
  const money = [f.received, f.remaining, f.fxResultCny].some(shown);
  if (!costs && !money) return null;

  return (
    <Card aria-label={t('orders.financials.title')} className="space-y-3 text-sm">
      <h2 className="text-sm font-semibold">{t('orders.financials.title')}</h2>
      {costs ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown(f.agreedPriceCny) ? (
            <Figure label={t('orders.financials.agreedPriceCny')}>
              {f.agreedPriceCny != null ? <AmountText value={f.agreedPriceCny} currency="CNY" className="font-medium" /> : <span>—</span>}
              {order.agreedRate ? (
                <p className="text-xs text-muted-foreground">
                  <bdi dir="ltr">
                    1 {order.currency} = {order.agreedRate} CNY
                  </bdi>
                </p>
              ) : null}
            </Figure>
          ) : null}
          {f.expensesTotal !== undefined ? (
            <Figure label={t('orders.financials.expenses')}>
              <AmountText value={f.expensesTotal} currency="CNY" className="font-medium" />
            </Figure>
          ) : null}
          {f.unpaid !== undefined ? (
            <Figure label={t('orders.financials.unpaid')}>
              <AmountText value={f.unpaid} currency="CNY" />
            </Figure>
          ) : null}
          {f.profitUnavailableReason ? (
            <div className="col-span-2 sm:col-span-3">
              <Link
                to={`/orders/${order.id}/edit`}
                className="inline-flex min-h-11 items-center rounded-lg border border-warning bg-warning/10 px-3 text-sm font-medium"
              >
                {t('orders.financials.setAgreedRate')}
              </Link>
            </div>
          ) : shown(f.profit) ? (
            <>
              <Figure label={t('orders.financials.profit')}>
                <AmountText value={f.profit ?? '0'} currency="CNY" className={cn('text-base font-semibold', loss && 'text-danger')} />
              </Figure>
              <Figure label={t('orders.financials.margin')}>
                {f.marginPercent != null ? <Percent value={f.marginPercent} /> : <span>—</span>}
              </Figure>
            </>
          ) : null}
          {shown(f.budgetUsedPercent) ? (
            <Figure label={t('orders.financials.budgetUsed')}>
              {f.budgetUsedPercent != null ? (
                <span className={cn(overBudget && 'rounded bg-danger/15 px-1.5 py-0.5 font-semibold text-danger')}>
                  <Percent value={f.budgetUsedPercent} />
                  {overBudget ? <span className="sr-only"> {t('orders.financials.overBudget')}</span> : null}
                </span>
              ) : (
                <span>—</span>
              )}
            </Figure>
          ) : null}
        </div>
      ) : null}
      {/* 004 FR-020: money received and still to collect, in the order's currency. */}
      {money ? (
        <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', costs && 'border-t border-border pt-3')}>
          {f.received !== undefined ? (
            <Figure label={t('orders.financials.received')}>
              <AmountText value={f.received} currency={order.currency} className="font-medium" />
              {order.currency !== 'CNY' && f.receivedCny !== undefined ? (
                <p className="text-xs text-muted-foreground">
                  <AmountText value={f.receivedCny} currency="CNY" />
                </p>
              ) : null}
            </Figure>
          ) : null}
          {f.remaining !== undefined ? (
            <Figure label={t('orders.financials.remaining')}>
              <AmountText value={f.remaining} currency={order.currency} className="font-medium" />
              {f.percentPaid != null ? (
                <p className="text-xs text-muted-foreground">
                  {t('orders.financials.paid')} <Percent value={f.percentPaid} />
                </p>
              ) : null}
            </Figure>
          ) : null}
          {f.fxResultCny != null && (order.currency !== 'CNY' || f.fxResultCny !== '0.00') ? (
            <Figure label={f.fxResultCny.startsWith('-') ? t('orders.financials.fxLoss') : t('orders.financials.fxGain')}>
              <AmountText value={f.fxResultCny} currency="CNY" signed className={cn(f.fxResultCny.startsWith('-') && 'text-danger')} />
            </Figure>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
