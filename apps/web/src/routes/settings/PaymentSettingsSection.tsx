import { BASIS_POINTS, type PaymentSettings } from '@hanjing/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { ApiError } from '@/api/http';
import { usePatchPaymentSettings, usePaymentSettings } from '@/api/payments';
import { newStage, PlanEditor, planTotal, type StageDraft } from '@/components/PlanEditor';
import { Field } from '@/components/Field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface BankDraft {
  key: string;
  name: string;
}

let nextBank = 0;
const bankDraft = (name: string): BankDraft => ({ key: `bank-${nextBank++}`, name });

function PaymentSettingsForm({ settings }: { settings: PaymentSettings }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const banksId = useId();
  const patch = usePatchPaymentSettings();
  const [direct, setDirect] = useState(settings.channelNames.direct ?? '');
  const [bank, setBank] = useState(settings.channelNames.bank ?? '');
  const [plan, setPlan] = useState<StageDraft[]>(() =>
    settings.defaultPlan.map((s) =>
      newStage({ type: s.type, channel: s.channel, percent: s.percent, dueBeforeStatus: s.dueBeforeStatus ?? '' }),
    ),
  );
  const [banks, setBanks] = useState<BankDraft[]>(() => settings.banks.map(bankDraft));
  const [planError, setPlanError] = useState<string | null>(null);
  const server = fieldErrors(patch.error);
  const otherError =
    patch.error && !(patch.error instanceof ApiError && patch.error.code === 'validation_failed') ? errorMessage(patch.error) : null;
  const bankError = Object.entries(server).find(([key]) => key === 'banks' || key.startsWith('banks.'))?.[1];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (planTotal(plan) !== BASIS_POINTS) {
      setPlanError(t('errors.plan_total_invalid'));
      return;
    }
    setPlanError(null);
    patch.mutate({
      channelNames: { direct, bank },
      defaultPlan: plan.map((s) => ({ type: s.type, channel: s.channel, percent: s.percent, dueBeforeStatus: s.dueBeforeStatus || null })),
      banks: banks.map((b) => b.name.trim()).filter(Boolean),
    });
  }

  const moveBank = (index: number, by: -1 | 1) => {
    const next = [...banks];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    setBanks(next);
  };

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{t('settings.payments.channelNames')}</h3>
        <Field
          label={t('paymentChannel.direct')}
          hint={t('settings.payments.channelNameHint')}
          value={direct}
          maxLength={40}
          placeholder={t('paymentChannel.direct')}
          onChange={(e) => setDirect(e.target.value)}
          error={server['channelNames.direct'] ? t(`errors.${server['channelNames.direct']}`) : null}
          dir="auto"
        />
        <Field
          label={t('paymentChannel.bank')}
          value={bank}
          maxLength={40}
          placeholder={t('paymentChannel.bank')}
          onChange={(e) => setBank(e.target.value)}
          error={server['channelNames.bank'] ? t(`errors.${server['channelNames.bank']}`) : null}
          dir="auto"
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('settings.payments.defaultPlan')}</h3>
        <p className="text-xs text-muted-foreground">{t('settings.payments.defaultPlanHint')}</p>
        <PlanEditor
          stages={plan}
          onChange={setPlan}
          withDueDate={false}
          error={planError ?? (server.defaultPlan ? t(`errors.${server.defaultPlan}`) : null)}
        />
      </div>

      <div className="space-y-2">
        <h3 id={banksId} className="text-sm font-semibold">
          {t('settings.payments.banks')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('settings.payments.banksHint')}</p>
        <ul className="space-y-2" aria-labelledby={banksId}>
          {banks.map((item, index) => (
            <li key={item.key} className="flex flex-wrap items-center gap-1">
              <Input
                className="min-w-0 flex-1"
                value={item.name}
                maxLength={60}
                aria-label={t('settings.payments.bankN', { n: index + 1 })}
                onChange={(e) => setBanks(banks.map((b, i) => (i === index ? { ...b, name: e.target.value } : b)))}
                dir="auto"
              />
              <Button variant="ghost" aria-label={t('settings.payments.moveBankUp', { name: item.name })} disabled={index === 0} onClick={() => moveBank(index, -1)}>
                ↑
              </Button>
              <Button
                variant="ghost"
                aria-label={t('settings.payments.moveBankDown', { name: item.name })}
                disabled={index === banks.length - 1}
                onClick={() => moveBank(index, 1)}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                className="text-danger"
                aria-label={t('settings.payments.removeBank', { name: item.name })}
                onClick={() => setBanks(banks.filter((_, i) => i !== index))}
              >
                {t('settings.payments.remove')}
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" disabled={banks.length >= 30} onClick={() => setBanks([...banks, bankDraft('')])}>
          {t('settings.payments.addBank')}
        </Button>
        {bankError ? <p className="text-sm text-danger">{t(`errors.${bankError}`)}</p> : null}
      </div>

      {otherError ? <Alert tone="danger">{otherError}</Alert> : null}
      {patch.isSuccess ? <Alert tone="success">{t('settings.saved')}</Alert> : null}
      <Button type="submit" disabled={patch.isPending}>
        {patch.isPending ? t('common.saving') : t('settings.payments.save')}
      </Button>
    </form>
  );
}

/** 004 FR-027: the names of the two channels, the plan given to new orders, and the Chinese banks offered. */
export function PaymentSettingsSection() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const headingId = useId();
  const settings = usePaymentSettings();
  return (
    <section aria-labelledby={headingId}>
      <Card className="space-y-4">
        <h2 id={headingId} className="text-lg font-semibold">
          {t('settings.payments.title')}
        </h2>
        {settings.error ? <Alert tone="danger">{errorMessage(settings.error)}</Alert> : null}
        {settings.data ? <PaymentSettingsForm settings={settings.data} /> : null}
      </Card>
    </section>
  );
}
