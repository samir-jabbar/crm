import { BANK_RATE_TYPES, type BankRateType, type ForeignCurrency } from '@hanjing/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { RateField } from '@/components/RateField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export interface BankDraft {
  open: boolean;
  rate: string;
  name: string;
  /** The name is typed instead of chosen from the list. */
  custom: boolean;
  rateType: BankRateType;
  /** `datetime-local` value, in the phone's own time zone. */
  at: string;
}

/** Now, as a `datetime-local` value ("2026-10-08T10:30"). */
export function nowLocalDateTime(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export const emptyBank = (): BankDraft => ({ open: false, rate: '', name: '', custom: false, rateType: 'buying', at: nowLocalDateTime() });

const OTHER = '__other__';

/**
 * The Chinese bank's conversion of a foreign-currency payment (004 FR-008): its rate, the bank, the rate type and
 * when the bank published that rate (banks update during the day). Always typed: no automatic source (ROADMAP D8).
 */
export function BankConversionBlock({
  currency,
  value,
  banks,
  onChange,
  errors,
}: {
  currency: ForeignCurrency;
  value: BankDraft;
  banks: string[];
  onChange: (value: BankDraft) => void;
  errors: { rate?: string | null; name?: string | null; block?: string | null };
}) {
  const { t } = useTranslation();
  const bankId = useId();
  const typeId = useId();
  const atId = useId();
  const otherId = useId();
  const set = <K extends keyof BankDraft>(key: K, v: BankDraft[K]) => onChange({ ...value, [key]: v });

  if (!value.open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => onChange({ ...value, open: true, at: value.at || nowLocalDateTime() })}>
          {t('payments.bank.add')}
        </Button>
        {errors.block ? <p className="mt-1 text-sm text-danger">{errors.block}</p> : null}
      </div>
    );
  }

  const listed = !value.custom && (value.name === '' || banks.includes(value.name));
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">{t('payments.bank.title')}</legend>
      <RateField
        id="payment-bank-rate"
        label={t('payments.bank.rate')}
        currency={currency}
        value={value.rate}
        onValueChange={(rate) => set('rate', rate)}
        error={errors.rate ?? null}
      />
      <div>
        <Label htmlFor={bankId}>{t('payments.bank.name')}</Label>
        <Select
          id={bankId}
          value={listed ? value.name : OTHER}
          onChange={(e) =>
            e.target.value === OTHER
              ? onChange({ ...value, custom: true, name: '' })
              : onChange({ ...value, custom: false, name: e.target.value })
          }
          aria-invalid={errors.name ? true : undefined}
        >
          <option value="">{t('payments.bank.chooseBank')}</option>
          {banks.map((bank) => (
            <option key={bank} value={bank}>
              {bank}
            </option>
          ))}
          <option value={OTHER}>{t('payments.bank.otherBank')}</option>
        </Select>
        {!listed ? (
          <div className="mt-2">
            <Label htmlFor={otherId}>{t('payments.bank.typedName')}</Label>
            <Input id={otherId} value={value.name} maxLength={60} onChange={(e) => set('name', e.target.value)} dir="auto" />
          </div>
        ) : null}
        {errors.name ? <p className="mt-1 text-sm text-danger">{errors.name}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={typeId}>{t('payments.bank.rateType')}</Label>
          <Select id={typeId} value={value.rateType} onChange={(e) => set('rateType', e.target.value as BankRateType)}>
            {BANK_RATE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`bankRateType.${type}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={atId}>{t('payments.bank.at')}</Label>
          <Input id={atId} type="datetime-local" value={value.at} onChange={(e) => set('at', e.target.value)} dir="ltr" />
        </div>
      </div>
      {errors.block ? <p className="text-sm text-danger">{errors.block}</p> : null}
      <Button variant="ghost" onClick={() => onChange({ ...value, open: false })}>
        {t('payments.bank.remove')}
      </Button>
    </fieldset>
  );
}
