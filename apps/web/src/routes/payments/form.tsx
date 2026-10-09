import {
  CURRENCY_CODES,
  PAYMENT_CHANNELS,
  PAYMENT_TYPES,
  paymentInputSchema,
  type CurrencyCode,
  type ErrorCode,
  type ForeignCurrency,
  type Payment,
  type PaymentChannel,
  type PaymentInput,
  type PaymentSummary,
  type PaymentType,
  type RateSource,
} from '@hanjing/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { ApiError } from '@/api/http';
import { useOrder } from '@/api/orders';
import { useCreatePayment, useOrderPayments, usePayment, usePaymentsConfig, useUpdatePayment } from '@/api/payments';
import { BankConversionBlock, emptyBank, nowLocalDateTime, type BankDraft } from '@/components/BankConversionBlock';
import { Field } from '@/components/Field';
import { MoneyInput } from '@/components/MoneyInput';
import { PaymentRatesBlock, type PaymentRates } from '@/components/PaymentRatesBlock';
import { PaymentResults, type CountsAsDraft } from '@/components/PaymentResults';
import { ReceiptInput, type ReceiptValue } from '@/components/ReceiptInput';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { channelName } from '@/lib/payments';
import { todayLocal } from '@/routes/expenses/form';

export interface PaymentDraft {
  channel: PaymentChannel;
  type: PaymentType;
  amount: string;
  currency: CurrencyCode;
  paymentDate: string;
  reference: string;
  rates: PaymentRates;
  rateSource: RateSource;
  ratesFetchedAt: string | null;
  bank: BankDraft;
  countsAs: CountsAsDraft;
  proof: ReceiptValue | null;
  notes: string;
}

const plainRate = (rate: string | null) => (rate ? rate.replace(/\.?0+$/, '') : '');

export function emptyPaymentDraft(channel: PaymentChannel, orderCurrency: CurrencyCode): PaymentDraft {
  return {
    channel,
    type: channel === 'direct' ? 'deposit' : 'balance',
    amount: '',
    currency: orderCurrency,
    paymentDate: todayLocal(),
    reference: '',
    rates: { USD: '', MAD: '', EUR: '' },
    rateSource: 'manual',
    ratesFetchedAt: null,
    bank: emptyBank(),
    countsAs: { manual: false, value: '' },
    proof: null,
    notes: '',
  };
}

/** A `datetime-local` value for an instant, in the phone's own time zone. */
const localDateTime = (iso: string) => nowLocalDateTime(new Date(iso));

/** Editing a payment needs its amounts visible (005 FR-032), so they are present here. */
export function draftFromPayment(payment: Payment): PaymentDraft {
  const rates = payment.rates ?? { USD: '', MAD: '', EUR: null };
  return {
    channel: payment.channel,
    type: payment.type,
    amount: (payment.amount ?? '').replace(/\.00$/, ''),
    currency: payment.currency,
    paymentDate: payment.paymentDate,
    reference: payment.reference ?? '',
    rates: { USD: plainRate(rates.USD), MAD: plainRate(rates.MAD), EUR: plainRate(rates.EUR) },
    rateSource: payment.rateSource,
    ratesFetchedAt: payment.ratesFetchedAt,
    bank: payment.bank
      ? {
          open: true,
          rate: plainRate(payment.bank.rate ?? ''),
          name: payment.bank.name ?? '',
          custom: false,
          rateType: payment.bank.rateType,
          at: localDateTime(payment.bank.at),
        }
      : emptyBank(),
    countsAs: payment.countsAs?.manual ? { manual: true, value: payment.countsAs.amount.replace(/\.00$/, '') } : { manual: false, value: '' },
    proof: payment.proofId
      ? {
          id: payment.proofId,
          mime: payment.proofMime ?? '',
          previewUrl: payment.proofMime?.startsWith('image/') ? `/api/payments/${payment.id}/proof` : null,
        }
      : null,
    notes: payment.notes ?? '',
  };
}

export function draftToInput(draft: PaymentDraft): PaymentInput {
  const bankOpen = draft.bank.open && draft.currency !== 'CNY';
  return {
    channel: draft.channel,
    type: draft.type,
    amount: draft.amount,
    currency: draft.currency,
    paymentDate: draft.paymentDate,
    reference: draft.reference,
    rates: { USD: draft.rates.USD || null, MAD: draft.rates.MAD || null, EUR: draft.rates.EUR || null } as PaymentInput['rates'],
    rateSource: draft.rateSource,
    ratesFetchedAt: draft.rateSource === 'manual' ? null : draft.ratesFetchedAt,
    bank: bankOpen
      ? {
          rate: draft.bank.rate,
          name: draft.bank.name,
          rateType: draft.bank.rateType,
          at: draft.bank.at ? new Date(draft.bank.at).toISOString() : '',
        }
      : null,
    // Changing the currency resets "counts as", so a typed figure is only ever sent for a conversion.
    countsAs: draft.countsAs.manual ? draft.countsAs.value || null : null,
    proofId: draft.proof?.id ?? null,
    notes: draft.notes,
  };
}

function validate(input: PaymentInput): Record<string, ErrorCode> {
  const result = paymentInputSchema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, ErrorCode> = {};
  for (const issue of result.error.issues) errors[issue.path.map(String).join('.') || '_'] ??= issue.message as ErrorCode;
  return errors;
}

/** Shared by "Add payment" and "Edit payment" (004 US1, US2, US6). Inputs are never cleared on error. */
export function PaymentForm({
  initial,
  orderCurrency,
  summary,
  previous,
  isNew,
  submitLabel,
  pending,
  error,
  onSubmit,
  cancelTo,
}: {
  initial: PaymentDraft;
  orderCurrency: CurrencyCode;
  summary: PaymentSummary | undefined;
  previous?: { channel: PaymentChannel; orderAmount: string } | null;
  isNew: boolean;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (input: PaymentInput) => void;
  cancelTo: string;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const config = usePaymentsConfig();
  const [draft, setDraft] = useState<PaymentDraft>(initial);
  const [localErrors, setLocalErrors] = useState<Record<string, ErrorCode>>({});
  const [uploading, setUploading] = useState(false);
  const serverErrors = fieldErrors(error);
  const errorFor = (path: string) => {
    const code = localErrors[path] ?? serverErrors[path];
    return code ? t(`errors.${code}`) : null;
  };
  const set = <K extends keyof PaymentDraft>(key: K, value: PaymentDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const otherError =
    error && !(error instanceof ApiError && error.code === 'validation_failed') ? errorMessage(error) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const input = draftToInput(draft);
    const errors = validate(input);
    setLocalErrors(errors);
    if (Object.keys(errors).length === 0) onSubmit(input);
  }

  return (
    <form className="space-y-5 pb-4" onSubmit={submit} noValidate>
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="payment-channel">{t('payments.form.channel')}</Label>
            <Select id="payment-channel" value={draft.channel} onChange={(e) => set('channel', e.target.value as PaymentChannel)}>
              {PAYMENT_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {channelName(c, config.data?.channels[c].name, t)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="payment-type">{t('payments.form.type')}</Label>
            <Select
              id="payment-type"
              value={draft.type}
              onChange={(e) => set('type', e.target.value as PaymentType)}
              aria-invalid={errorFor('type') ? true : undefined}
            >
              {PAYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`paymentType.${type}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <Label htmlFor="payment-amount">{t('payments.form.amount')}</Label>
            <MoneyInput
              id="payment-amount"
              value={draft.amount}
              onValueChange={(v) => set('amount', v)}
              aria-invalid={errorFor('amount') ? true : undefined}
            />
          </div>
          <div>
            <Label htmlFor="payment-currency">{t('payments.form.currency')}</Label>
            <Select
              id="payment-currency"
              value={draft.currency}
              onChange={(e) =>
                // A new currency starts with its own "counts as" and no bank conversion for CNY.
                setDraft((d) => ({
                  ...d,
                  currency: e.target.value as CurrencyCode,
                  countsAs: { manual: false, value: '' },
                  bank: e.target.value === 'CNY' ? { ...d.bank, open: false } : d.bank,
                }))
              }
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {errorFor('amount') ? <p className="-mt-2 text-sm text-danger">{errorFor('amount')}</p> : null}
        <Field
          label={t('payments.form.date')}
          type="date"
          value={draft.paymentDate}
          onChange={(e) => set('paymentDate', e.target.value)}
          error={errorFor('paymentDate')}
        />
        <Field
          label={t('payments.form.reference')}
          hint={t('payments.form.referenceHint')}
          value={draft.reference}
          maxLength={80}
          onChange={(e) => set('reference', e.target.value)}
          error={errorFor('reference')}
          dir="auto"
        />
      </Card>

      <Card className="space-y-4">
        <PaymentRatesBlock
          currency={draft.currency}
          orderCurrency={orderCurrency}
          date={draft.paymentDate}
          rates={draft.rates}
          source={draft.rateSource}
          autoFillWhenEmpty={isNew}
          errors={{ USD: errorFor('rates.USD'), MAD: errorFor('rates.MAD'), EUR: errorFor('rates.EUR') }}
          onChange={(rates, rateSource, fetchedAt) =>
            setDraft((d) => ({ ...d, rates, rateSource, ratesFetchedAt: fetchedAt ?? d.ratesFetchedAt }))
          }
        />
        {errorFor('rates') ? <p className="text-sm text-danger">{errorFor('rates')}</p> : null}
        {draft.currency !== 'CNY' ? (
          <BankConversionBlock
            currency={draft.currency as ForeignCurrency}
            value={draft.bank}
            banks={config.data?.banks ?? []}
            onChange={(bank) => set('bank', bank)}
            errors={{ rate: errorFor('bank.rate'), name: errorFor('bank.name'), block: errorFor('bank') ?? errorFor('bank.at') ?? errorFor('bank.rateType') }}
          />
        ) : null}
      </Card>

      <PaymentResults
        amount={draft.amount}
        currency={draft.currency}
        orderCurrency={orderCurrency}
        date={draft.paymentDate}
        channel={draft.channel}
        rates={draft.rates}
        bankRate={draft.bank.open && draft.currency !== 'CNY' ? draft.bank.rate : ''}
        countsAs={draft.countsAs}
        onCountsAsChange={(countsAs) => set('countsAs', countsAs)}
        countsAsError={errorFor('countsAs')}
        summary={summary}
        previous={previous}
      />

      <Card className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium">{t('payments.form.proof')}</p>
          <ReceiptInput
            value={draft.proof}
            onChange={(proof) => set('proof', proof)}
            onBusyChange={setUploading}
            uploadPath="/api/payment-proofs"
            attachedLabel={t('payments.proof.attached')}
            previewLabel={t('payments.proof.preview')}
          />
          {errorFor('proofId') ? <p className="mt-1 text-sm text-danger">{errorFor('proofId')}</p> : null}
        </div>
        <div>
          <Label htmlFor="payment-notes">{t('payments.form.notes')}</Label>
          <textarea
            id="payment-notes"
            rows={3}
            maxLength={2000}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
            dir="auto"
          />
        </div>
      </Card>

      {Object.keys(localErrors).length > 0 || (error instanceof ApiError && error.code === 'validation_failed') ? (
        <Alert tone="danger">{t('errors.validation_failed')}</Alert>
      ) : null}
      {otherError ? <Alert tone="danger">{otherError}</Alert> : null}

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          to={cancelTo}
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          {t('common.cancel')}
        </Link>
        <Button type="submit" size="lg" className="flex-1" disabled={pending || uploading}>
          {pending ? t('common.saving') : uploading ? t('payments.proof.waitUpload') : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** US1: "Add payment" from a channel section of the Payments tab, full screen on phones. */
export function NewPaymentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: orderId = '' } = useParams();
  const [params] = useSearchParams();
  const channel: PaymentChannel = params.get('channel') === 'direct' ? 'direct' : 'bank';
  const order = useOrder(orderId);
  const payments = useOrderPayments(orderId);
  const create = useCreatePayment(orderId);
  const backTo = `/orders/${orderId}?tab=payments`;

  if (order.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (!order.data) return null;
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">
          <bdi dir="ltr">{order.data.number}</bdi> · <bdi>{order.data.title}</bdi>
        </p>
        <h1 className="text-2xl font-semibold">{t('payments.newTitle')}</h1>
      </header>
      <PaymentForm
        initial={emptyPaymentDraft(channel, order.data.currency)}
        orderCurrency={order.data.currency}
        summary={payments.data?.summary}
        isNew
        submitLabel={t('payments.form.save')}
        pending={create.isPending}
        error={create.error}
        cancelTo={backTo}
        onSubmit={(input) => create.mutate(input, { onSuccess: () => void navigate(backTo, { replace: true }) })}
      />
    </div>
  );
}

/** US6: correct any field of a payment (FR-024). */
export function EditPaymentPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const payment = usePayment(id);
  const payments = useOrderPayments(payment.data?.orderId);
  const update = useUpdatePayment(id);

  if (payment.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (payment.error) return <Alert tone="danger">{errorMessage(payment.error)}</Alert>;
  const p = payment.data;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('payments.editTitle')}</h1>
      <PaymentForm
        initial={draftFromPayment(p)}
        orderCurrency={p.countsAs?.currency ?? p.currency}
        summary={payments.data?.summary}
        previous={{ channel: p.channel, orderAmount: p.countsAs?.amount ?? '0' }}
        isNew={false}
        submitLabel={t('payments.form.save')}
        pending={update.isPending}
        error={update.error}
        cancelTo={`/payments/${p.id}`}
        onSubmit={(input) => update.mutate(input, { onSuccess: () => void navigate(`/payments/${p.id}`, { replace: true }) })}
      />
    </div>
  );
}
