import { PAYMENT_CHANNEL_SCOPES } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useDeletePayment, usePayment, usePaymentsConfig } from '@/api/payments';
import { AmountText } from '@/components/AmountText';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { CalendarDate } from '@/components/ExpenseBits';
import { inverseRate } from '@/components/PaymentRatesBlock';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/i18n/format';
import { useAccess } from '@/lib/access';
import { channelName } from '@/lib/payments';

/** "7.100000" → "7.1". */
const plainRate = (rate: string) => rate.replace(/\.?0+$/, '');

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

/** US1/US2/US6: one payment with every value as it was frozen, its proof, and who created and last changed it. */
export function PaymentDetailPage() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const payment = usePayment(id);
  const config = usePaymentsConfig();
  const remove = useDeletePayment();
  const access = useAccess();

  if (payment.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (payment.error) return <Alert tone="danger">{errorMessage(payment.error)}</Alert>;
  const p = payment.data;
  const proofUrl = `/api/payments/${p.id}/proof`;
  const rateRow = (currency: 'USD' | 'MAD' | 'EUR') => {
    const rate = p.rates?.[currency];
    if (!rate) return null;
    return (
      <Row key={currency} label={t('payments.form.rateTo', { currency })}>
        <bdi dir="ltr">
          1 {currency} = {plainRate(rate)} CNY
        </bdi>
        <span className="block text-xs text-muted-foreground" dir="ltr">
          1 CNY = {inverseRate(plainRate(rate))} {currency}
        </span>
      </Row>
    );
  };

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <Link to={`/orders/${p.orderId}?tab=payments`} className="text-sm text-primary underline-offset-2 hover:underline">
          {t('payments.backToOrder')}
        </Link>
        <h1 className="text-2xl font-semibold">
          <AmountText value={p.amount} currency={p.currency} />
        </h1>
        <p className="text-sm text-muted-foreground">
          <span dir="auto">{channelName(p.channel, config.data?.channels[p.channel].name, t)}</span> · {t(`paymentType.${p.type}`)} ·{' '}
          <CalendarDate value={p.paymentDate} />
        </p>
        <div className="flex flex-wrap gap-2">
          {access.can(PAYMENT_CHANNEL_SCOPES[p.channel], 'edit') ? (
          <Link
            to={`/payments/${p.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            {t('payments.actions.edit')}
          </Link>
          ) : null}
          {access.can(PAYMENT_CHANNEL_SCOPES[p.channel], 'delete') ? (
          <ConfirmDelete
            title={t('payments.delete.title')}
            body={t('payments.delete.body')}
            pending={remove.isPending}
            error={remove.error}
            onReset={() => remove.reset()}
            onConfirm={() =>
              remove.mutate(p.id, { onSuccess: () => void navigate(`/orders/${p.orderId}?tab=payments`, { replace: true }) })
            }
          />
          ) : null}
        </div>
      </header>

      <Card>
        <dl className="divide-y divide-border text-sm">
          {/* 005: amounts and rates are absent when hidden from the viewer. */}
          {p.cnyAmount !== undefined ? (
            <Row label={t('payments.results.cny')}>
              <AmountText value={p.cnyAmount} currency="CNY" className="font-semibold" />
            </Row>
          ) : null}
          {p.countsAs ? (
            <Row label={t('payments.results.countsAs')}>
              <AmountText value={p.countsAs.amount} currency={p.countsAs.currency} />
              {p.countsAs.manual ? <span className="ms-1 text-xs text-muted-foreground">({t('payments.results.manual')})</span> : null}
            </Row>
          ) : null}
          {p.usdAmount !== undefined ? (
            <Row label={t('payments.results.usd')}>
              <AmountText value={p.usdAmount} currency="USD" />
            </Row>
          ) : null}
          {p.madAmount !== undefined ? (
            <Row label={t('payments.results.mad')}>
              <AmountText value={p.madAmount} currency="MAD" />
            </Row>
          ) : null}
          {(['USD', 'MAD', 'EUR'] as const).map(rateRow)}
          <Row label={t('payments.detail.rateSource')}>
            {t(`rateSource.${p.rateSource}`)}
            {p.ratesFetchedAt ? (
              <span className="block text-xs text-muted-foreground">{formatDateTime(p.ratesFetchedAt, i18n.language)}</span>
            ) : null}
          </Row>
          {p.reference ? (
            <Row label={t('payments.form.reference')}>
              <bdi>{p.reference}</bdi>
            </Row>
          ) : null}
          {p.notes ? (
            <Row label={t('payments.form.notes')}>
              <span className="whitespace-pre-line" dir="auto">
                {p.notes}
              </span>
            </Row>
          ) : null}
        </dl>
      </Card>

      {p.bank ? (
        <Card className="space-y-2 text-sm">
          <h2 className="text-sm font-semibold">{t('payments.bank.title')}</h2>
          <dl className="divide-y divide-border">
            {p.bank.name !== undefined ? (
              <Row label={t('payments.bank.name')}>
                <bdi>{p.bank.name}</bdi>
              </Row>
            ) : null}
            <Row label={t('payments.bank.rate')}>
              {p.bank.rate !== undefined ? (
                <bdi dir="ltr">
                  1 {p.currency} = {plainRate(p.bank.rate)} CNY
                </bdi>
              ) : null}
              <span className="block text-xs text-muted-foreground">{t(`bankRateType.${p.bank.rateType}`)}</span>
            </Row>
            <Row label={t('payments.bank.at')}>{formatDateTime(p.bank.at, i18n.language)}</Row>
            {p.marketRate ? (
              <Row label={t('payments.compare.market')}>
                <bdi dir="ltr">
                  1 {p.currency} = {plainRate(p.marketRate.rate)} CNY
                </bdi>
                <span className="block text-xs text-muted-foreground">
                  <CalendarDate value={p.marketRate.rateDate} />
                </span>
              </Row>
            ) : null}
            {p.gap ? (
              <Row label={t('payments.compare.gap')}>
                <AmountText value={p.gap.cny} currency="CNY" signed />{' '}
                <bdi dir="ltr">
                  ({t('payments.compare.vsMarket', { percent: Number(p.gap.percent) > 0 ? `+${p.gap.percent}` : p.gap.percent })})
                </bdi>
              </Row>
            ) : null}
          </dl>
        </Card>
      ) : null}

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">{t('payments.form.proof')}</h2>
        {!p.hasProof ? (
          <p className="text-sm text-muted-foreground">{t('payments.proof.none')}</p>
        ) : p.proofMime?.startsWith('image/') ? (
          <a href={proofUrl} target="_blank" rel="noopener">
            <img src={proofUrl} alt={t('payments.proof.preview')} className="max-h-96 w-full rounded-lg border border-border object-contain" />
          </a>
        ) : (
          <a
            href={proofUrl}
            download
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            {t('expenses.receipt.openPdf')}
          </a>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {t('expenses.createdBy', { user: p.createdBy ?? '—', date: formatDateTime(p.createdAt, i18n.language) })}
        <br />
        {t('expenses.updatedBy', { user: p.updatedBy ?? '—', date: formatDateTime(p.updatedAt, i18n.language) })}
      </p>
    </div>
  );
}
