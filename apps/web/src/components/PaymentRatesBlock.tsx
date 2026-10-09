import {
  FOREIGN_CURRENCIES,
  formatRate,
  isRate,
  mulDivRound,
  parseRate,
  RATE_SCALE,
  type CurrencyCode,
  type ForeignCurrency,
  type RateQuote,
  type RateSource,
} from '@hanjing/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRate, useRateConfig } from '@/api/rates';
import { RateField } from '@/components/RateField';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/i18n/format';

export type PaymentRates = Record<ForeignCurrency, string>;

/** "7.100000" → "7.1": what a person would type. */
const plainRate = (rate: string) => rate.replace(/\.?0+$/, '');

/** "1 CNY = 0.140845 USD": the inverse of a typed rate, or null while the rate is not valid yet. */
export function inverseRate(rate: string): string | null {
  if (!isRate(rate)) return null;
  return formatRate(mulDivRound(RATE_SCALE, RATE_SCALE, parseRate(rate)));
}

/** The rate fields a payment needs (research R2): USD and MAD always, EUR when the payment or the order is in EUR. */
export function neededCurrencies(currency: CurrencyCode, orderCurrency: CurrencyCode): ForeignCurrency[] {
  return FOREIGN_CURRENCIES.filter((c) => c !== 'EUR' || currency === 'EUR' || orderCurrency === 'EUR');
}

/**
 * The payment's rates to CNY (004 FR-006, FR-007): MAD→CNY and USD→CNY always visible with their inverses, EUR→CNY
 * when needed, one "Fetch rate" for all of them for the payment date, and automatic filling of a new payment when the
 * 003 setting is on. Fetched values stay editable; typing after a fetch makes them "Automatic, then edited".
 */
export function PaymentRatesBlock({
  currency,
  orderCurrency,
  date,
  rates,
  source,
  autoFillWhenEmpty,
  errors,
  onChange,
}: {
  currency: CurrencyCode;
  orderCurrency: CurrencyCode;
  date: string;
  rates: PaymentRates;
  source: RateSource;
  autoFillWhenEmpty: boolean;
  errors: Partial<Record<ForeignCurrency, string | null>>;
  onChange: (rates: PaymentRates, source: RateSource, fetchedAt: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const config = useRateConfig();
  const canFetch = config.data !== undefined && config.data.provider !== 'manual';
  const needed = neededCurrencies(currency, orderCurrency);
  const [fetching, setFetching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [quotes, setQuotes] = useState<Partial<Record<ForeignCurrency, RateQuote>>>({});
  const ratesRef = useRef(rates);
  useEffect(() => {
    ratesRef.current = rates;
  }, [rates]);

  async function load(mode: 'manual' | 'auto') {
    setFetching(true);
    setUnavailable(false);
    const results = await Promise.allSettled(needed.map((c) => fetchRate(c, date || undefined)));
    setFetching(false);
    const fetched: Partial<Record<ForeignCurrency, RateQuote>> = {};
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') fetched[needed[i]!] = result.value;
    });
    if (results.some((r) => r.status === 'rejected')) setUnavailable(true);
    if (Object.keys(fetched).length === 0) return;
    // An automatic fill never replaces what the user typed meanwhile (003 FR-017).
    if (mode === 'auto' && needed.some((c) => ratesRef.current[c] !== '')) return;
    setQuotes(fetched);
    const next = { ...ratesRef.current };
    for (const [c, quote] of Object.entries(fetched) as [ForeignCurrency, RateQuote][]) next[c] = plainRate(quote.rate);
    onChange(next, 'auto', new Date().toISOString());
  }

  const triedAutoFill = useRef(false);
  useEffect(() => {
    if (!autoFillWhenEmpty || triedAutoFill.current || !config.data) return;
    triedAutoFill.current = true;
    if (config.data.autoFill && config.data.provider !== 'manual' && needed.every((c) => ratesRef.current[c] === '')) {
      void load('auto');
    }
    // Runs once, when the settings are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data, autoFillWhenEmpty]);

  const anyQuote = Object.values(quotes)[0];
  const sourceLabel =
    source === 'auto' && anyQuote
      ? t('rates.sourceAuto', {
          date: formatDateTime(`${anyQuote.rateDate}T00:00:00`, i18n.language, { dateStyle: 'medium' }),
          provider: t(`rates.providers.${anyQuote.provider}`),
        })
      : needed.some((c) => rates[c] !== '')
        ? t(`rateSource.${source}`)
        : null;

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-medium">
        <span>{t('payments.form.rates')}</span>
        {canFetch ? (
          <Button variant="secondary" onClick={() => void load('manual')} disabled={fetching}>
            {fetching ? t('rates.fetching') : t('rates.fetch')}
          </Button>
        ) : null}
      </legend>
      {needed.map((c) => (
        <RateField
          key={c}
          id={`payment-rate-${c}`}
          label={t('payments.form.rateTo', { currency: c })}
          currency={c}
          value={rates[c]}
          onValueChange={(value) => onChange({ ...rates, [c]: value }, source === 'manual' ? 'manual' : 'auto_edited', null)}
          error={errors[c] ?? null}
          hint={
            inverseRate(rates[c]) ? (
              <bdi dir="ltr">
                1 CNY = {inverseRate(rates[c])} {c}
              </bdi>
            ) : null
          }
        />
      ))}
      {sourceLabel ? <p className="text-xs text-muted-foreground">{sourceLabel}</p> : null}
      {unavailable ? (
        <p role="status" className="text-sm text-danger">
          {t('errors.rates_unavailable')}
        </p>
      ) : null}
      {config.data?.provider === 'manual' ? <p className="text-xs text-muted-foreground">{t('rates.manualOnly')}</p> : null}
      {config.data?.attribution && anyQuote ? (
        <p className="text-xs text-muted-foreground">
          <a href={config.data.attribution.url} target="_blank" rel="noopener noreferrer" className="underline">
            {config.data.attribution.text}
          </a>
        </p>
      ) : null}
    </fieldset>
  );
}
