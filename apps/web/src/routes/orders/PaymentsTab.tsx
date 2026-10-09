import { PAYMENT_CHANNEL_SCOPES, type Payment, type PaymentChannel, type PaymentSummary } from '@hanjing/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useOrderPayments, useRestorePayment } from '@/api/payments';
import { useAccess } from '@/lib/access';
import { AmountText, formatMoney } from '@/components/AmountText';
import { CalendarDate, ReceiptMarker } from '@/components/ExpenseBits';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/i18n/format';
import { channelName } from '@/lib/payments';
import { cn } from '@/lib/utils';

/** "7.100000" → "7.1". */
const plainRate = (rate: string) => rate.replace(/\.?0+$/, '');

function Percent({ value }: { value: string | null }) {
  const { i18n } = useTranslation();
  if (value === null) return <span>—</span>;
  return (
    <bdi dir="ltr" className="tabular-nums">
      {formatNumber(Number(value) / 100, i18n.language, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </bdi>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  );
}

/**
 * Three amounts side by side from `sm`. On phones, one per line with the label facing the amount: three large
 * amounts do not fit side by side at 360px.
 */
function FigureRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn('grid gap-1 sm:grid-cols-3 sm:gap-3', className)}>{children}</dl>;
}

function RowFigure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * FR-004, FR-016, FR-019: what was received, what remains, in CNY / USD / MAD, average rates and the exchange result.
 * 005 FR-027: each figure is shown only when present; a viewer who sees neither channel's totals gets no card.
 */
function SummaryCard({ summary }: { summary: PaymentSummary }) {
  const { t } = useTranslation();
  const fx = summary.fxResultCny;
  const showFx = fx != null && (summary.currency !== 'CNY' || fx !== '0.00');
  const averageRates = summary.averageRates ?? [];
  const top = [summary.agreedPrice, summary.received, summary.remaining, summary.percentPaid].some((v) => v !== undefined);
  if (!top && !summary.receivedTotals && averageRates.length === 0 && !summary.agreedRate && !showFx) return null;
  return (
    <Card className="space-y-3 text-sm" aria-label={t('payments.summary.title')}>
      <h2 className="text-sm font-semibold">{t('payments.summary.title')}</h2>
      {top ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.agreedPrice !== undefined ? (
            <Figure label={t('payments.summary.agreedPrice')}>
              <AmountText value={summary.agreedPrice} currency={summary.currency} />
            </Figure>
          ) : null}
          {summary.received !== undefined ? (
            <Figure label={t('payments.summary.received')}>
              <AmountText value={summary.received} currency={summary.currency} className="font-semibold" />
            </Figure>
          ) : null}
          {summary.remaining !== undefined ? (
            <Figure label={t('payments.summary.remaining')}>
              <AmountText value={summary.remaining} currency={summary.currency} className="font-semibold" />
              {summary.remainingCny != null && summary.currency !== 'CNY' ? (
                <p className="text-xs text-muted-foreground">
                  <AmountText value={summary.remainingCny} currency="CNY" />
                </p>
              ) : null}
            </Figure>
          ) : null}
          {summary.percentPaid !== undefined ? (
            <Figure label={t('payments.summary.percentPaid')}>
              <Percent value={summary.percentPaid} />
            </Figure>
          ) : null}
        </div>
      ) : null}
      {summary.overpaid !== undefined && summary.overpaid !== '0.00' ? (
        <p className="text-warning">
          {t('payments.summary.overpaid')} <AmountText value={summary.overpaid} currency={summary.currency} />
        </p>
      ) : null}
      {summary.receivedTotals ? (
        <FigureRow className="border-t border-border pt-3">
          <RowFigure label={t('payments.summary.receivedIn', { currency: 'CNY' })}>
            <AmountText value={summary.receivedTotals.cny} currency="CNY" />
          </RowFigure>
          <RowFigure label={t('payments.summary.receivedIn', { currency: 'USD' })}>
            <AmountText value={summary.receivedTotals.usd} currency="USD" />
          </RowFigure>
          <RowFigure label={t('payments.summary.receivedIn', { currency: 'MAD' })}>
            <AmountText value={summary.receivedTotals.mad} currency="MAD" />
          </RowFigure>
        </FigureRow>
      ) : null}
      {averageRates.length > 0 || summary.agreedRate || showFx ? (
        <dl className="space-y-1 border-t border-border pt-3">
          {averageRates.map((r) => (
            <div key={r.currency} className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{t('payments.summary.averageRate', { currency: r.currency })}</dt>
              <dd>
                <bdi dir="ltr">
                  1 {r.currency} = {plainRate(r.rate)} CNY
                </bdi>
              </dd>
            </div>
          ))}
          {summary.agreedRate ? (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{t('payments.summary.agreedRate')}</dt>
              <dd>
                <bdi dir="ltr">
                  1 {summary.currency} = {plainRate(summary.agreedRate)} CNY
                </bdi>
              </dd>
            </div>
          ) : null}
          {showFx ? (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{fx!.startsWith('-') ? t('payments.summary.fxLoss') : t('payments.summary.fxGain')}</dt>
              <dd>
                <AmountText value={fx!} currency="CNY" signed className={cn('font-semibold', fx!.startsWith('-') && 'text-danger')} />
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </Card>
  );
}

function PlanCard({ summary, orderId }: { summary: PaymentSummary; orderId: string }) {
  const { t } = useTranslation();
  const access = useAccess();
  return (
    <Card className="space-y-2 text-sm" aria-label={t('payments.plan.title')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('payments.plan.title')}</h2>
        {/* 005 FR-009: a plan covers both channels, so editing it needs Edit on both. */}
        {access.can('payments.direct', 'edit') && access.can('payments.bank', 'edit') ? (
          <Link to={`/orders/${orderId}/payment-plan`} className="text-sm text-primary underline-offset-2 hover:underline">
            {t('payments.plan.edit')}
          </Link>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {summary.plan.map((stage) => {
          const channel = summary.channels.find((c) => c.channel === stage.channel);
          return (
            <li key={stage.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">
              <span className="min-w-0">
                <span className="font-medium">{t(`paymentType.${stage.type}`)}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {channelName(stage.channel, channel?.name, t)} · <bdi dir="ltr">{stage.percent}%</bdi>
                </span>
                {stage.dueBeforeStatus ? (
                  <span className="block text-xs text-muted-foreground">
                    {t('payments.plan.dueBefore', { status: t(`orderStatus.${stage.dueBeforeStatus}`) })}
                  </span>
                ) : null}
                {stage.dueDate ? (
                  <span className="block text-xs text-muted-foreground">
                    {t('payments.plan.dueDate')} <CalendarDate value={stage.dueDate} />
                  </span>
                ) : null}
              </span>
              <AmountText value={stage.amount} currency={summary.currency} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ChannelSection({ summary, channel, orderId }: { summary: PaymentSummary; channel: PaymentChannel; orderId: string }) {
  const { t } = useTranslation();
  const access = useAccess();
  const figures = summary.channels.find((c) => c.channel === channel);
  if (!figures) return null;
  const name = channelName(channel, figures.name, t);
  const over = figures.remaining?.startsWith('-') ?? false;
  return (
    <section aria-label={name}>
      <Card className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold" dir="auto">
            {name}
          </h2>
          {access.can(PAYMENT_CHANNEL_SCOPES[channel], 'create') ? (
            <Link
              to={`/orders/${orderId}/payments/new?channel=${channel}`}
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              aria-label={t('payments.addTo', { channel: name })}
            >
              {t('payments.add')}
            </Link>
          ) : null}
        </div>
        <FigureRow>
          {/* 005 FR-027: each channel figure only when the viewer may see it. */}
          {figures.planned !== undefined ? (
            <RowFigure label={t('payments.channel.planned')}>
              <AmountText value={figures.planned} currency={summary.currency} />
            </RowFigure>
          ) : null}
          {figures.received !== undefined ? (
            <RowFigure label={t('payments.channel.received')}>
              <AmountText value={figures.received} currency={summary.currency} className="font-semibold" />
            </RowFigure>
          ) : null}
          {figures.remaining !== undefined ? (
            <RowFigure label={over ? t('payments.channel.overPlan') : t('payments.channel.remaining')}>
              <AmountText
                value={over ? figures.remaining.slice(1) : figures.remaining}
                currency={summary.currency}
                className={cn('font-semibold', over && 'text-warning')}
              />
            </RowFigure>
          ) : null}
        </FigureRow>
      </Card>
    </section>
  );
}

/** FR-005: newest first; cards on phones, a table from the `sm` breakpoint (no sideways scroll at 360px). */
function History({ items, summary }: { items: Payment[]; summary: PaymentSummary }) {
  const { t } = useTranslation();
  const name = (channel: PaymentChannel) => channelName(channel, summary.channels.find((c) => c.channel === channel)?.name, t);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t('payments.empty')}</p>;
  return (
    <section aria-label={t('payments.history.title')} className="space-y-2">
      <h2 className="text-lg font-semibold">{t('payments.history.title')}</h2>
      <ul className="space-y-2 sm:hidden" aria-label={t('payments.history.title')}>
        {items.map((p) => (
          <li key={p.id}>
            <Link to={`/payments/${p.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
              <Card className="space-y-1 text-sm hover:bg-muted/50">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-medium" dir="auto">
                      {name(p.channel)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <CalendarDate value={p.paymentDate} /> · {t(`paymentType.${p.type}`)}
                    </span>
                  </span>
                  <AmountText value={p.amount} currency={p.currency} className="font-semibold" />
                </div>
                {p.rates ? (
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <bdi dir="ltr">
                      USD {plainRate(p.rates.USD)} · MAD {plainRate(p.rates.MAD)}
                    </bdi>
                    <AmountText value={p.cnyAmount} currency="CNY" />
                  </div>
                ) : null}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t(`rateSource.${p.rateSource}`)}</span>
                  {p.hasProof ? <ReceiptMarker /> : null}
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">{t('payments.history.date')}</th>
              <th className="py-2 text-start font-medium">{t('payments.history.channel')}</th>
              <th className="py-2 text-end font-medium">{t('payments.history.amount')}</th>
              <th className="py-2 text-end font-medium">MAD/CNY</th>
              <th className="py-2 text-end font-medium">USD/CNY</th>
              <th className="py-2 text-end font-medium">CNY</th>
              <th className="py-2 text-start font-medium">{t('payments.history.source')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-2">
                  <Link to={`/payments/${p.id}`} className="text-primary underline-offset-2 hover:underline">
                    <CalendarDate value={p.paymentDate} />
                  </Link>
                </td>
                <td className="py-2" dir="auto">
                  {name(p.channel)}
                </td>
                <td className="py-2 text-end">
                  <AmountText value={p.amount} currency={p.currency} />
                </td>
                <td className="py-2 text-end tabular-nums" dir="ltr">
                  {p.rates ? plainRate(p.rates.MAD) : null}
                </td>
                <td className="py-2 text-end tabular-nums" dir="ltr">
                  {p.rates ? plainRate(p.rates.USD) : null}
                </td>
                <td className="py-2 text-end">
                  <AmountText value={p.cnyAmount} currency="CNY" />
                </td>
                <td className="py-2">
                  {t(`rateSource.${p.rateSource}`)} {p.hasProof ? <ReceiptMarker /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** FR-025: deleted payments, each with "Restore". They are not links: a deleted payment has no page. */
function DeletedPayments({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const deleted = useOrderPayments(orderId, { deleted: true });
  const restore = useRestorePayment();
  if (deleted.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (deleted.error) return <Alert tone="danger">{errorMessage(deleted.error)}</Alert>;
  if (deleted.data.items.length === 0) return <p className="text-sm text-muted-foreground">{t('payments.noDeleted')}</p>;
  return (
    <ul className="space-y-2" aria-label={t('payments.deletedTitle')}>
      {deleted.data.items.map((p) => (
        <li key={p.id}>
          <Card className="flex flex-wrap items-center justify-between gap-3 text-sm opacity-80">
            <span className="min-w-0">
              <span className="block font-medium">
                <AmountText value={p.amount} currency={p.currency} />
              </span>
              <span className="text-xs text-muted-foreground">
                <CalendarDate value={p.paymentDate} /> · {t(`paymentType.${p.type}`)}
              </span>
            </span>
            <Button variant="secondary" disabled={restore.isPending} onClick={() => restore.mutate(p.id)}>
              {t('payments.actions.restore')}
            </Button>
          </Card>
        </li>
      ))}
      {restore.error ? <Alert tone="danger">{errorMessage(restore.error)}</Alert> : null}
    </ul>
  );
}

/** 004 FR-004 – FR-005, FR-019, FR-021: the two channels, the plan, the summary and the history of an order. */
export function PaymentsTab({ orderId }: { orderId: string }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const payments = useOrderPayments(orderId);
  const [showDeleted, setShowDeleted] = useState(false);
  const deletedToggleId = useId();
  const access = useAccess();

  if (payments.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (payments.error) return <Alert tone="danger">{errorMessage(payments.error)}</Alert>;
  const { items, summary } = payments.data;
  return (
    <div className="space-y-4">
      {/* 005 FR-028: a worker who sees only their own entries sees figures of those entries, labelled so. */}
      {access.ownEntriesOnly ? <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('access.yourEntries')}</p> : null}
      <SummaryCard summary={summary} />
      {summary.warnings?.overpaid ? (
        <Alert tone="warning">
          {t('payments.warnings.overpaid', { amount: formatMoney(summary.warnings?.overpaid, summary.currency, i18n.language) })}
        </Alert>
      ) : null}
      {summary.warnings?.bankOverInvoice ? (
        <Alert tone="warning">
          {t('payments.warnings.bankOverInvoice', {
            amount: formatMoney(summary.warnings?.bankOverInvoice, summary.currency, i18n.language),
          })}
        </Alert>
      ) : null}
      {summary.channels.map((c) => (
        <ChannelSection key={c.channel} summary={summary} channel={c.channel} orderId={orderId} />
      ))}
      <PlanCard summary={summary} orderId={orderId} />
      <History items={items} summary={summary} />
      {access.can('payments', 'delete') ? (
        <label htmlFor={deletedToggleId} className="flex min-h-11 items-center gap-2 text-sm">
          <input id={deletedToggleId} type="checkbox" className="size-5" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          {t('payments.showDeleted')}
        </label>
      ) : null}
      {showDeleted ? <DeletedPayments orderId={orderId} /> : null}
    </div>
  );
}
