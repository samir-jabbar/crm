import { isRate, parseRate, rateDeviates, type ForeignCurrency, type RateQuote, type RateSource } from '@hanjing/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRate, useRateConfig } from '@/api/rates';
import { RateField } from '@/components/RateField';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/i18n/format';

/** "7.100000" → "7.1": what a person would type. */
const plainRate = (rate: string) => rate.replace(/\.?0+$/, '');

/**
 * A rate to CNY with "Fetch rate" (003 FR-015 – FR-018, FR-005): the result is labelled with its date and source
 * and stays editable; typing after a fetch makes it "Automatic, then edited". When the provider is down the field
 * says so and stays typeable. A typed rate more than 20% away from the latest known one shows a warning.
 */
export function AutoRateField({
  id,
  label,
  currency,
  date,
  value,
  source,
  onChange,
  error,
  autoFillWhenEmpty = false,
}: {
  id: string;
  label: string;
  currency: ForeignCurrency;
  /** Ask for this date's rate (an expense date); latest when absent. */
  date?: string;
  value: string;
  source: RateSource;
  onChange: (value: string, source: RateSource) => void;
  error?: string | null;
  /** FR-017: fill an empty field once, when auto-fill is on. Never replaces a typed rate. */
  autoFillWhenEmpty?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const config = useRateConfig();
  const canFetch = config.data !== undefined && config.data.provider !== 'manual';
  const [quote, setQuote] = useState<RateQuote | null>(null);
  const [fetching, setFetching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // The current value, readable when a fetch resolves later (to never overwrite what the user typed meanwhile).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Reference for the typo warning: the latest rate (served from the server's daily cache).
  const latest = useQuery({
    queryKey: ['rate-latest', currency],
    queryFn: () => fetchRate(currency),
    enabled: canFetch,
    retry: false,
    staleTime: 10 * 60_000,
  });

  async function load(mode: 'manual' | 'auto') {
    setFetching(true);
    setUnavailable(false);
    try {
      const result = await fetchRate(currency, date);
      // An automatic fill that arrives after the user started typing is dropped (FR-017).
      if (mode === 'auto' && valueRef.current !== '') return;
      setQuote(result);
      onChange(plainRate(result.rate), 'auto');
    } catch {
      setUnavailable(true);
    } finally {
      setFetching(false);
    }
  }

  const triedAutoFill = useRef(false);
  useEffect(() => {
    if (!autoFillWhenEmpty || triedAutoFill.current || !config.data) return;
    triedAutoFill.current = true;
    if (config.data.autoFill && config.data.provider !== 'manual' && valueRef.current === '') void load('auto');
    // Runs once, when the settings are known for this currency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data, autoFillWhenEmpty]);

  const reference = quote ?? latest.data ?? null;
  const typo = reference && isRate(value) && rateDeviates(parseRate(value), parseRate(reference.rate));
  const providerName = (p: string) => t(`rates.providers.${p}`);
  const sourceLabel =
    source === 'auto' && quote
      ? t('rates.sourceAuto', {
          date: formatDateTime(`${quote.rateDate}T00:00:00`, i18n.language, { dateStyle: 'medium' }),
          provider: providerName(quote.provider),
        })
      : value
        ? t(`rateSource.${source}`)
        : null;

  return (
    <div className="space-y-1">
      <RateField
        id={id}
        label={label}
        currency={currency}
        value={value}
        onValueChange={(v) => onChange(v, source === 'manual' ? 'manual' : 'auto_edited')}
        error={error}
        action={
          canFetch ? (
            <Button variant="secondary" onClick={() => void load('manual')} disabled={fetching}>
              {fetching ? t('rates.fetching') : t('rates.fetch')}
            </Button>
          ) : null
        }
        hint={sourceLabel}
      />
      {/* Only for a back-dated expense that got a newer rate (FR-015). For today, the latest rate is the
          normal answer even when today's is not published yet, and the label already shows its date. */}
      {quote && source === 'auto' && !quote.exact && date && date < quote.rateDate ? (
        <p className="text-xs text-warning">{t('rates.notExact', { date: quote.rateDate })}</p>
      ) : null}
      {unavailable ? (
        <p role="status" className="text-sm text-danger">
          {t('errors.rates_unavailable')}
        </p>
      ) : null}
      {config.data?.provider === 'manual' ? <p className="text-xs text-muted-foreground">{t('rates.manualOnly')}</p> : null}
      {typo ? (
        <p role="status" className="rounded-lg bg-warning/15 px-2 py-1 text-sm">
          {t('rates.typoWarning', { rate: plainRate(reference.rate), currency })}
        </p>
      ) : null}
      {config.data?.attribution && (quote || latest.data) ? (
        <p className="text-xs text-muted-foreground">
          <a href={config.data.attribution.url} target="_blank" rel="noopener noreferrer" className="underline">
            {config.data.attribution.text}
          </a>
        </p>
      ) : null}
    </div>
  );
}
