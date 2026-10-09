import { BASIS_POINTS, type PlanStage } from '@hanjing/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { ApiError } from '@/api/http';
import { useOrder } from '@/api/orders';
import { useOrderPayments, useUpdatePlan } from '@/api/payments';
import { newStage, PlanEditor, planTotal, type StageDraft } from '@/components/PlanEditor';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const toDraft = (stage: PlanStage): StageDraft =>
  newStage({
    type: stage.type,
    channel: stage.channel,
    percent: stage.percent,
    dueBeforeStatus: stage.dueBeforeStatus ?? '',
    dueDate: stage.dueDate ?? '',
  });

function PlanForm({ orderId, initial, agreedPrice, currency }: { orderId: string; initial: StageDraft[]; agreedPrice: string | undefined; currency: Parameters<typeof PlanEditor>[0]['currency'] }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const update = useUpdatePlan(orderId);
  const [stages, setStages] = useState(initial);
  const [localError, setLocalError] = useState<string | null>(null);
  const backTo = `/orders/${orderId}?tab=payments`;
  const serverFields = fieldErrors(update.error);
  const serverError = serverFields.stages ? t(`errors.${serverFields.stages}`) : null;
  const otherError =
    update.error && !(update.error instanceof ApiError && update.error.code === 'validation_failed') ? errorMessage(update.error) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (planTotal(stages) !== BASIS_POINTS) {
      setLocalError(t('errors.plan_total_invalid'));
      return;
    }
    setLocalError(null);
    update.mutate(
      {
        stages: stages.map((s) => ({
          type: s.type,
          channel: s.channel,
          percent: s.percent,
          dueBeforeStatus: s.dueBeforeStatus || null,
          dueDate: s.dueDate || null,
        })),
      },
      { onSuccess: () => void navigate(backTo, { replace: true }) },
    );
  }

  return (
    <form className="space-y-4 pb-4" onSubmit={submit} noValidate>
      <PlanEditor stages={stages} onChange={setStages} withDueDate agreedPrice={agreedPrice} currency={currency} error={localError ?? serverError} />
      {otherError ? <Alert tone="danger">{otherError}</Alert> : null}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          to={backTo}
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          {t('common.cancel')}
        </Link>
        <Button type="submit" size="lg" className="flex-1" disabled={update.isPending}>
          {update.isPending ? t('common.saving') : t('payments.plan.save')}
        </Button>
      </div>
    </form>
  );
}

/** US4: change an order's payment plan (FR-014). */
export function OrderPlanPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: orderId = '' } = useParams();
  const order = useOrder(orderId);
  const payments = useOrderPayments(orderId);

  if (order.isPending || payments.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (order.error || payments.error) return <Alert tone="danger">{errorMessage(order.error ?? payments.error)}</Alert>;
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">
          <bdi dir="ltr">{order.data.number}</bdi> · <bdi>{order.data.title}</bdi>
        </p>
        <h1 className="text-2xl font-semibold">{t('payments.plan.editTitle')}</h1>
      </header>
      <PlanForm
        orderId={orderId}
        initial={payments.data.summary.plan.map(toDraft)}
        agreedPrice={order.data.agreedPrice}
        currency={order.data.currency}
      />
    </div>
  );
}
