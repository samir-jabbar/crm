import {
  ORDER_NUMBER_PREFIX_PATTERN,
  SESSION_IDLE_TIMEOUT_MINUTES,
  type SettingsResponse,
  type UpdateSettingsRequest,
} from '@hanjing/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { api, ApiError } from '@/api/http';
import { queryKeys } from '@/api/queries';
import { useAccess } from '@/lib/access';
import { Field } from '@/components/Field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ExchangeRatesSection } from './settings/ExchangeRatesSection';
import { ExpenseCategoriesSection } from './settings/ExpenseCategoriesSection';
import { PaymentSettingsSection } from './settings/PaymentSettingsSection';

type Unit = 'minutes' | 'hours' | 'days';
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

function splitTimeout(minutes: number): { amount: string; unit: Unit } {
  if (minutes % 1440 === 0) return { amount: String(minutes / 1440), unit: 'days' };
  if (minutes % 60 === 0) return { amount: String(minutes / 60), unit: 'hours' };
  return { amount: String(minutes), unit: 'minutes' };
}

function SettingsForm({ settings, readOnly }: { settings: SettingsResponse; readOnly: boolean }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const timeoutId = useId();
  const unitId = useId();
  const currenciesId = useId();
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [timeoutValue, setTimeoutValue] = useState(() =>
    splitTimeout(settings.sessionIdleTimeoutMinutes ?? 720),
  );
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [prefix, setPrefix] = useState(settings.orderNumberPrefix);
  // 005 FR-011: security settings come only to the Owner.
  const security = settings.sessionIdleTimeoutMinutes !== undefined;
  const [registrationOpen, setRegistrationOpen] = useState(settings.registrationOpen ?? true);
  const registrationId = useId();
  const [prefixError, setPrefixError] = useState<string | null>(null);
  // "-2026-003": the part of the preview after the saved prefix; the typed prefix replaces it live.
  const numberSuffix = settings.nextOrderNumber.slice(settings.orderNumberPrefix.length);

  const save = useMutation({
    mutationFn: (body: UpdateSettingsRequest) => api<SettingsResponse>('PATCH', '/api/settings', body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.settings, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });

  const server = fieldErrors(save.error);
  const otherError =
    save.error && !(save.error instanceof ApiError && save.error.code === 'validation_failed')
      ? errorMessage(save.error)
      : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.reset();
    const minutes = Number(timeoutValue.amount) * UNIT_MINUTES[timeoutValue.unit];
    if (
      security &&
      (!Number.isInteger(minutes) || minutes < SESSION_IDLE_TIMEOUT_MINUTES.min || minutes > SESSION_IDLE_TIMEOUT_MINUTES.max)
    ) {
      setTimeoutError(t('errors.timeout_out_of_range'));
      return;
    }
    setTimeoutError(null);
    const trimmedPrefix = prefix.trim();
    if (!ORDER_NUMBER_PREFIX_PATTERN.test(trimmedPrefix)) {
      setPrefixError(t('errors.prefix_invalid'));
      return;
    }
    setPrefixError(null);
    save.mutate({
      companyName: companyName.trim(),
      orderNumberPrefix: trimmedPrefix,
      ...(security ? { sessionIdleTimeoutMinutes: minutes, registrationOpen } : {}),
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={readOnly} className="space-y-5">
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">{t('settings.company.title')}</h2>
        <Field
          label={t('settings.company.name')}
          hint={t('settings.company.nameHint')}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          error={server.companyName ? t(`errors.${server.companyName}`) : null}
          maxLength={120}
          dir="auto"
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t('settings.orderNumbers.title')}</h2>
        <Field
          label={t('settings.orderNumbers.prefix')}
          hint={t('settings.orderNumbers.hint')}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          error={prefixError ?? (server.orderNumberPrefix ? t(`errors.${server.orderNumberPrefix}`) : null)}
          maxLength={10}
          autoCapitalize="characters"
          dir="ltr"
        />
        <p className="text-sm">
          {t('settings.orderNumbers.next')}{' '}
          <span className="font-semibold" dir="ltr">
            {(prefix.trim() || settings.orderNumberPrefix) + numberSuffix}
          </span>
        </p>
      </Card>

      <section aria-labelledby={currenciesId}>
        <Card>
          <h2 id={currenciesId} className="text-lg font-semibold">
            {t('settings.currencies.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.currencies.description')}</p>
          <ul className="mt-3 divide-y divide-border">
            {settings.currencies.map((c) => (
              <li key={c.code} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="font-medium">{c.code}</span>{' '}
                  <span className="text-muted-foreground">
                    {t(`currency.${c.code}`)} · {c.symbol}
                  </span>
                </span>
                {c.code === settings.baseCurrency ? (
                  <Badge tone="primary">{t('settings.currencies.base')}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {security ? (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">{t('settings.session.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.session.description')}</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor={timeoutId}>{t('settings.session.timeout')}</Label>
              <Input
                id={timeoutId}
                type="number"
                inputMode="numeric"
                min={1}
                value={timeoutValue.amount}
                onChange={(e) => setTimeoutValue((v) => ({ ...v, amount: e.target.value }))}
                aria-invalid={timeoutError || server.sessionIdleTimeoutMinutes ? true : undefined}
                dir="ltr"
              />
            </div>
            <div className="w-36">
              <Label htmlFor={unitId}>{t('settings.session.unit')}</Label>
              <Select
                id={unitId}
                value={timeoutValue.unit}
                onChange={(e) => setTimeoutValue((v) => ({ ...v, unit: e.target.value as Unit }))}
              >
                {(Object.keys(UNIT_MINUTES) as Unit[]).map((u) => (
                  <option key={u} value={u}>
                    {t(`settings.session.units.${u}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {timeoutError || server.sessionIdleTimeoutMinutes ? (
            <p className="text-sm text-danger">{timeoutError ?? t('errors.timeout_out_of_range')}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('settings.session.range')}</p>
          )}
          <label htmlFor={registrationId} className="flex min-h-11 items-start gap-3 pt-2">
            <input
              id={registrationId}
              type="checkbox"
              className="mt-1 size-5"
              checked={registrationOpen}
              onChange={(e) => setRegistrationOpen(e.target.checked)}
            />
            <span>
              <span className="block font-medium">{t('settings.registration.label')}</span>
              <span className="block text-xs text-muted-foreground">{t('settings.registration.hint')}</span>
            </span>
          </label>
        </Card>
      ) : null}

      {otherError ? <Alert tone="danger">{otherError}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">{t('settings.saved')}</Alert> : null}
      {readOnly ? null : (
        <Button type="submit" size="lg" disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
      )}
      </fieldset>
    </form>
  );
}

/** US5: company name, currencies (CNY fixed as base) and session timeout. Owner-only. */
export function SettingsPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const access = useAccess();
  const settings = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api<SettingsResponse>('GET', '/api/settings'),
    enabled: access.can('settings'),
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
      {access.can('settings') && settings.isPending ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {settings.error ? <Alert tone="danger">{errorMessage(settings.error)}</Alert> : null}
      {settings.data ? <SettingsForm settings={settings.data} readOnly={!access.can('settings', 'edit')} /> : null}
      {/* 005 FR-009: each section shows only with its module. */}
      {access.can('rates') ? (
        <fieldset disabled={!access.can('rates', 'edit')}>
          <ExchangeRatesSection />
        </fieldset>
      ) : null}
      {access.can('settings') && access.can('expenses') ? (
        <fieldset disabled={!access.can('settings', 'edit')}>
          <ExpenseCategoriesSection />
        </fieldset>
      ) : null}
      {access.can('settings') && access.can('payments.direct') && access.can('payments.bank') ? (
        <fieldset disabled={!access.can('settings', 'edit')}>
          <PaymentSettingsSection />
        </fieldset>
      ) : null}
    </div>
  );
}
