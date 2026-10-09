import {
  formatAmount,
  formatRate,
  isAmount,
  isRate,
  parseAmount,
  parseRate,
  paymentGap,
  paymentValues,
  type CurrencyCode,
  type PaymentChannel,
  type PaymentSummary,
} from '@hanjing/shared';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRate, useRateConfig } from '@/api/rates';
import { AmountText, formatMoney } from '@/components/AmountText';
import { MoneyInput } from '@/components/MoneyInput';
import type { PaymentRates } from '@/components/PaymentRatesBlock';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export interface CountsAsDraft {
  manual: boolean;
  value: string;
}

const micro = (rate: string) => (isRate(rate) ? parseRate(rate) : null);

/**
 * The live results of a payment (004 FR-010, FR-021): its value in CNY, USD and MAD; what it counts for toward the
 * order, overridable when it is a conversion; for a bank conversion, the three rates side by side, the CNY actually
 * received and the gap from the market; and the overpayment warnings. Computed with the same shared functions as the
 * server, so what is shown is what will be saved. Never blocks saving.
 */
export function PaymentResults({
  amount,
  currency,
  orderCurrency,
  date,
  channel,
  rates,
  bankRate,
  countsAs,
  onCountsAsChange,
  countsAsError,
  summary,
  previous,
}: {
  amount: string;
  currency: CurrencyCode;
  orderCurrency: CurrencyCode;
  date: string;
  channel: PaymentChannel;
  rates: PaymentRates;
  /** The bank's rate when the bank block is open, else ''. */
  bankRate: string;
  countsAs: CountsAsDraft;
  onCountsAsChange: (value: CountsAsDraft) => void;
  countsAsError?: string | null;
  summary: PaymentSummary | undefined;
  /** On edit: what this payment counted for before, in its old channel, so it is not counted twice. */
  previous?: { channel: PaymentChannel; orderAmount: string } | null;
}) {
  const { t, i18n } = useTranslation();
  const countsAsId = useId();
  const config = useRateConfig();
  const bankMicro = bankRate ? micro(bankRate) : null;
  const foreign = currency !== 'CNY';

  // The market rate of the payment's currency on its date: the same cached rate the server keeps (research R3).
  const market = useQuery({
    queryKey: ['payment-market-rate', currency, date],
    queryFn: () => fetchRate(currency as Exclude<CurrencyCode, 'CNY'>, date || undefined),
    enabled: foreign && bankMicro !== null && config.data !== undefined && config.data.provider !== 'manual',
    retry: false,
    staleTime: 10 * 60_000,
  });
  const marketMicro = market.data ? parseRate(market.data.rate) : null;

  const usd = micro(rates.USD);
  const mad = micro(rates.MAD);
  const eur = micro(rates.EUR);
  const typedCountsAs = countsAs.manual && isAmount(countsAs.value) ? parseAmount(countsAs.value) : null;
  let values: ReturnType<typeof paymentValues> | null = null;
  if (isAmount(amount) && usd !== null && mad !== null && (bankRate === '' || bankMicro !== null)) {
    try {
      values = paymentValues({
        amountMinor: parseAmount(amount),
        currency,
        orderCurrency,
        rates: { USD: usd, MAD: mad, EUR: eur },
        bankRateMicro: bankMicro,
        countsAsMinor: typedCountsAs,
      });
    } catch {
      values = null; // a needed rate (EUR) is still missing
    }
  }
  const gap = values && marketMicro !== null ? paymentGap(parseAmount(amount), bankMicro, marketMicro) : null;
  const customerMicro = currency === 'USD' ? usd : currency === 'MAD' ? mad : currency === 'EUR' ? eur : null;
  const conversion = currency !== orderCurrency;

  // Live warnings (FR-021), from the current summary plus this payment (minus its old value on edit).
  let overpaid: bigint | null = null;
  let bankOver: bigint | null = null;
  // 005: without the agreed price or the total received, there is nothing to warn about (they are hidden).
  if (summary && values && summary.agreedPrice !== undefined && summary.received !== undefined) {
    const agreed = BigInt(parseAmount(summary.agreedPrice));
    const before = previous ? BigInt(parseAmount(previous.orderAmount)) : 0n;
    const received = BigInt(parseAmount(summary.received)) - before + values.orderMinor;
    if (received > agreed) overpaid = received - agreed;
    const bankReceived = summary.channels.find((c) => c.channel === 'bank');
    if (bankReceived?.received !== undefined) {
      const bankBefore = previous?.channel === 'bank' ? before : 0n;
      const total = BigInt(parseAmount(bankReceived.received)) - bankBefore + (channel === 'bank' ? values.orderMinor : 0n);
      if (total > agreed) bankOver = total - agreed;
    }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <div className="space-y-3">
      <Card className="space-y-2 text-sm" aria-live="polite">
        <h3 className="text-sm font-semibold">{t('payments.results.title')}</h3>
        <dl className="space-y-1.5">
          {row(t('payments.results.cny'), values ? <AmountText value={formatAmount(values.cnyMinor)} currency="CNY" className="font-semibold" /> : '—')}
          {row(t('payments.results.usd'), values ? <AmountText value={formatAmount(values.usdMinor)} currency="USD" /> : '—')}
          {row(t('payments.results.mad'), values ? <AmountText value={formatAmount(values.madMinor)} currency="MAD" /> : '—')}
          {row(
            t('payments.results.countsAs'),
            values ? (
              <span>
                <AmountText value={formatAmount(values.orderMinor)} currency={orderCurrency} className="font-semibold" />
                {values.orderManual ? <span className="ms-1 text-xs text-muted-foreground">({t('payments.results.manual')})</span> : null}
              </span>
            ) : (
              '—'
            ),
          )}
        </dl>
        {conversion ? (
          countsAs.manual ? (
            <div className="space-y-1">
              <Label htmlFor={countsAsId}>{t('payments.results.countsAsTyped', { currency: orderCurrency })}</Label>
              <div className="flex gap-2">
                <MoneyInput
                  id={countsAsId}
                  value={countsAs.value}
                  onValueChange={(value) => onCountsAsChange({ manual: true, value })}
                  aria-invalid={countsAsError ? true : undefined}
                />
                <Button variant="ghost" onClick={() => onCountsAsChange({ manual: false, value: '' })}>
                  {t('payments.results.useComputed')}
                </Button>
              </div>
              {countsAsError ? <p className="text-sm text-danger">{countsAsError}</p> : null}
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => onCountsAsChange({ manual: true, value: values ? formatAmount(values.orderMinor).replace(/\.00$/, '') : '' })}
            >
              {t('payments.results.editCountsAs')}
            </Button>
          )
        ) : null}
      </Card>

      {foreign && bankMicro !== null ? (
        <Card className="space-y-2 text-sm">
          <h3 className="text-sm font-semibold">{t('payments.compare.title', { currency })}</h3>
          <div className="grid grid-cols-3 gap-2 text-center" dir="ltr">
            {[
              [t('payments.compare.market'), marketMicro],
              [t('payments.compare.bank'), bankMicro],
              [t('payments.compare.customer'), customerMicro],
            ].map(([label, rate]) => (
              <div key={label as string} className="rounded-lg bg-muted px-2 py-1.5">
                <p className="text-xs text-muted-foreground" dir="auto">
                  {label as string}
                </p>
                <p className="font-semibold tabular-nums">{rate === null ? '—' : formatRate(rate as number)}</p>
              </div>
            ))}
          </div>
          {values ? (
            <p className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">{t('payments.compare.received')}</span>
              <AmountText value={formatAmount(values.cnyMinor)} currency="CNY" className="font-semibold" />
            </p>
          ) : null}
          {gap ? (
            <p className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">{t('payments.compare.gap')}</span>
              <span>
                <AmountText value={formatAmount(gap.cny)} currency="CNY" signed />{' '}
                <bdi dir="ltr">({t('payments.compare.vsMarket', { percent: Number(gap.percent) > 0 ? `+${gap.percent}` : gap.percent })})</bdi>
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('payments.compare.noMarket')}</p>
          )}
        </Card>
      ) : null}

      {overpaid !== null ? (
        <Alert tone="warning">
          {t('payments.warnings.overpaid', { amount: formatMoney(formatAmount(overpaid), orderCurrency, i18n.language) })}
        </Alert>
      ) : null}
      {bankOver !== null ? (
        <Alert tone="warning">
          {t('payments.warnings.bankOverInvoice', { amount: formatMoney(formatAmount(bankOver), orderCurrency, i18n.language) })}
        </Alert>
      ) : null}
    </div>
  );
}
