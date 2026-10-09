import {
  BASIS_POINTS,
  formatAmount,
  formatPercent,
  isAmount,
  MAX_PLAN_STAGES,
  ORDER_STATUSES,
  PAYMENT_CHANNELS,
  PAYMENT_TYPES,
  parseAmount,
  parsePercent,
  planAmounts,
  type CurrencyCode,
  type OrderStatus,
  type PaymentChannel,
  type PaymentType,
} from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { usePaymentsConfig } from '@/api/payments';
import { AmountText } from '@/components/AmountText';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { channelName } from '@/lib/payments';
import { cn } from '@/lib/utils';

export interface StageDraft {
  key: string;
  type: PaymentType;
  channel: PaymentChannel;
  percent: string;
  dueBeforeStatus: OrderStatus | '';
  dueDate: string;
}

let nextKey = 0;
export const newStage = (partial: Partial<StageDraft> = {}): StageDraft => ({
  key: `stage-${nextKey++}`,
  type: 'other',
  channel: 'bank',
  percent: '',
  dueBeforeStatus: '',
  dueDate: '',
  ...partial,
});

/** Basis points of a typed percentage, or null while it is not valid yet. */
function bp(percent: string): number | null {
  try {
    return parsePercent(percent.replace(',', '.'));
  } catch {
    return null;
  }
}

/** The plan total in basis points, or null while a percentage is invalid. */
export function planTotal(stages: StageDraft[]): number | null {
  const values = stages.map((s) => bp(s.percent));
  return values.some((v) => v === null) ? null : values.reduce<number>((a, b) => a + (b ?? 0), 0);
}

/**
 * The stages of a payment plan (004 FR-012 – FR-014): type, channel, share of the agreed price, when it is due
 * ("before production" = before the order reaches that status), and an optional date. Shows the live total, which
 * must be 100%, and the planned amounts when the agreed price is known.
 */
export function PlanEditor({
  stages,
  onChange,
  withDueDate,
  agreedPrice,
  currency,
  error,
}: {
  stages: StageDraft[];
  onChange: (stages: StageDraft[]) => void;
  withDueDate: boolean;
  agreedPrice?: string;
  currency?: CurrencyCode;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const config = usePaymentsConfig();
  const total = planTotal(stages);
  const amounts =
    total !== null && agreedPrice && isAmount(agreedPrice)
      ? planAmounts(
          parseAmount(agreedPrice),
          stages.map((s) => bp(s.percent)!),
        )
      : null;
  const update = (index: number, patch: Partial<StageDraft>) => onChange(stages.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...stages];
    const [stage] = next.splice(index, 1);
    next.splice(index + by, 0, stage!);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {stages.map((stage, index) => (
          <li key={stage.key}>
            <Card className="space-y-3 text-sm" aria-label={t('payments.plan.stageN', { n: index + 1 })}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{t('payments.plan.stageN', { n: index + 1 })}</h3>
                {amounts ? <AmountText value={formatAmount(amounts[index]!)} currency={currency ?? 'CNY'} className="font-semibold" /> : null}
              </div>
              {/* One column on phones: channel and status names are long, and get cut off in half-width selects. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${stage.key}-type`}>{t('payments.form.type')}</Label>
                  <Select id={`${stage.key}-type`} value={stage.type} onChange={(e) => update(index, { type: e.target.value as PaymentType })}>
                    {PAYMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`paymentType.${type}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`${stage.key}-channel`}>{t('payments.form.channel')}</Label>
                  <Select
                    id={`${stage.key}-channel`}
                    value={stage.channel}
                    onChange={(e) => update(index, { channel: e.target.value as PaymentChannel })}
                  >
                    {PAYMENT_CHANNELS.map((channel) => (
                      <option key={channel} value={channel}>
                        {channelName(channel, config.data?.channels[channel].name, t)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`${stage.key}-percent`}>{t('payments.plan.percent')}</Label>
                  <div className="flex items-center gap-1" dir="ltr">
                    <Input
                      id={`${stage.key}-percent`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={stage.percent}
                      onChange={(e) => update(index, { percent: e.target.value.replace(',', '.') })}
                      aria-invalid={bp(stage.percent) === null ? true : undefined}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
                <div>
                  <Label htmlFor={`${stage.key}-due`}>{t('payments.plan.dueBeforeLabel')}</Label>
                  <Select
                    id={`${stage.key}-due`}
                    value={stage.dueBeforeStatus}
                    onChange={(e) => update(index, { dueBeforeStatus: e.target.value as OrderStatus | '' })}
                  >
                    <option value="">—</option>
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`orderStatus.${status}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                {withDueDate ? (
                  <div className="sm:col-span-2">
                    <Label htmlFor={`${stage.key}-date`}>{t('payments.plan.dueDateLabel')}</Label>
                    <Input id={`${stage.key}-date`} type="date" value={stage.dueDate} onChange={(e) => update(index, { dueDate: e.target.value })} />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" disabled={index === 0} onClick={() => move(index, -1)}>
                  {t('orders.items.moveUp')}
                </Button>
                <Button variant="ghost" disabled={index === stages.length - 1} onClick={() => move(index, 1)}>
                  {t('orders.items.moveDown')}
                </Button>
                <Button variant="ghost" className="text-danger" disabled={stages.length === 1} onClick={() => onChange(stages.filter((_, i) => i !== index))}>
                  {t('payments.plan.removeStage')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" disabled={stages.length >= MAX_PLAN_STAGES} onClick={() => onChange([...stages, newStage()])}>
          {t('payments.plan.addStage')}
        </Button>
        <p className={cn('text-sm font-semibold', total !== BASIS_POINTS && 'text-danger')} aria-live="polite">
          {t('payments.plan.total')} <bdi dir="ltr">{total === null ? '—' : `${formatPercent(total)}%`}</bdi>
        </p>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
