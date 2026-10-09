import type { RateProviderId, RateSettings } from '@hanjing/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/api/errors';
import { usePatchRateSettings, useRateSettings, useRefreshRates } from '@/api/rates';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/i18n/format';

function Status({ settings }: { settings: RateSettings }) {
  const { t, i18n } = useTranslation();
  const when = (iso: string) => formatDateTime(iso, i18n.language);
  const failedLast = settings.lastErrorAt && (!settings.lastFetchAt || settings.lastErrorAt > settings.lastFetchAt);
  return (
    <div className="space-y-1 text-sm" aria-live="polite">
      <p>
        <span className="text-muted-foreground">{t('settings.rates.lastFetch')}</span>{' '}
        {settings.lastFetchAt ? when(settings.lastFetchAt) : t('settings.rates.never')}
      </p>
      {failedLast ? (
        <p className="text-danger">{t('settings.rates.lastError', { date: when(settings.lastErrorAt!) })}</p>
      ) : null}
    </div>
  );
}

function RatesForm({ settings }: { settings: RateSettings }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const providerId = useId();
  const keyId = useId();
  const autoFillId = useId();
  const patch = usePatchRateSettings();
  const refresh = useRefreshRates();
  const [provider, setProvider] = useState<RateProviderId>(settings.provider);
  const [autoFill, setAutoFill] = useState(settings.autoFill);
  const [apiKey, setApiKey] = useState('');

  function save(e: FormEvent) {
    e.preventDefault();
    patch.mutate(
      { provider, autoFill, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) },
      { onSuccess: () => setApiKey('') },
    );
  }

  return (
    <form className="space-y-4" onSubmit={save} noValidate>
      <div>
        <Label htmlFor={providerId}>{t('settings.rates.provider')}</Label>
        <Select id={providerId} value={provider} onChange={(e) => setProvider(e.target.value as RateProviderId)}>
          {settings.providers.map((p) => (
            <option key={p} value={p}>
              {t(`rates.providers.${p}`)}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{t(`settings.rates.providerHelp.${provider}`)}</p>
      </div>

      <div>
        <Label htmlFor={keyId}>{t('settings.rates.apiKey')}</Label>
        <Input
          id={keyId}
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={settings.apiKeySet ? `•••• ${settings.apiKeyLast4 ?? ''}` : ''}
          onChange={(e) => setApiKey(e.target.value)}
          dir="ltr"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {settings.apiKeySet ? t('settings.rates.apiKeySet', { last4: settings.apiKeyLast4 }) : t('settings.rates.apiKeyHelp')}
        </p>
        {settings.apiKeySet ? (
          <Button variant="ghost" className="mt-1" disabled={patch.isPending} onClick={() => patch.mutate({ apiKey: null })}>
            {t('settings.rates.removeKey')}
          </Button>
        ) : null}
      </div>

      <label htmlFor={autoFillId} className="flex min-h-11 items-center gap-3">
        <input id={autoFillId} type="checkbox" className="size-5" checked={autoFill} onChange={(e) => setAutoFill(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium">{t('settings.rates.autoFill')}</span>
          <span className="block text-xs text-muted-foreground">{t('settings.rates.autoFillHelp')}</span>
        </span>
      </label>

      {patch.error ? <Alert tone="danger">{errorMessage(patch.error)}</Alert> : null}
      {patch.isSuccess ? <Alert tone="success">{t('settings.saved')}</Alert> : null}
      <Button type="submit" disabled={patch.isPending}>
        {patch.isPending ? t('common.saving') : t('settings.rates.save')}
      </Button>

      <div className="space-y-2 border-t border-border pt-4">
        <Status settings={settings} />
        <Button variant="secondary" disabled={refresh.isPending || settings.provider === 'manual'} onClick={() => refresh.mutate()}>
          {refresh.isPending ? t('rates.fetching') : t('settings.rates.refresh')}
        </Button>
        {refresh.error ? <Alert tone="danger">{errorMessage(refresh.error)}</Alert> : null}
        {refresh.data ? (
          <ul className="divide-y divide-border text-sm">
            {refresh.data.rates.map((r) => (
              <li key={r.currency} className="flex justify-between py-1.5">
                <bdi dir="ltr">
                  1 {r.currency} = {r.rate} CNY
                </bdi>
                <span className="text-muted-foreground">{r.rateDate}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {settings.attribution ? (
          <p className="text-xs text-muted-foreground">
            <a href={settings.attribution.url} target="_blank" rel="noopener noreferrer" className="underline">
              {settings.attribution.text}
            </a>
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** 003 FR-014: provider, access key (write-only), auto-fill, refresh and status. Owner-only, like all Settings. */
export function ExchangeRatesSection() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const headingId = useId();
  const settings = useRateSettings();
  return (
    <section aria-labelledby={headingId}>
      <Card className="space-y-4">
        <h2 id={headingId} className="text-lg font-semibold">
          {t('settings.rates.title')}
        </h2>
        {settings.error ? <Alert tone="danger">{errorMessage(settings.error)}</Alert> : null}
        {settings.data ? <RatesForm settings={settings.data} /> : null}
      </Card>
    </section>
  );
}
