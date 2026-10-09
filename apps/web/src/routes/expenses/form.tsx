import { PURCHASE_CATEGORY_ID } from '@hanjing/shared';
import {
  convertToCnyMinor,
  CURRENCY_CODES,
  EXPENSE_STATUSES,
  expenseInputSchema,
  formatAmount,
  isAmount,
  isRate,
  parseAmount,
  parseRate,
  PAYMENT_METHODS,
  RATE_SCALE,
  type CurrencyCode,
  type ErrorCode,
  type Expense,
  type ExpenseCategoryRef,
  type ExpenseInput,
  type ExpenseStatus,
  type ForeignCurrency,
  type PaymentMethod,
  type RateSource,
} from '@hanjing/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { useCreateExpense, useExpense, useExpenseCategories, useUpdateExpense } from '@/api/expenses';
import { ApiError } from '@/api/http';
import { useOrder } from '@/api/orders';
import { AmountText } from '@/components/AmountText';
import { Field } from '@/components/Field';
import { MoneyInput } from '@/components/MoneyInput';
import { emptyPaidTo, PaidToPicker, paidToInput, type PaidToDraft } from '@/components/PaidToPicker';
import { AdvancedByInput } from '@/components/AdvancedByInput';
import { AutoRateField } from '@/components/AutoRateField';
import { ReceiptInput, type ReceiptValue } from '@/components/ReceiptInput';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { categoryLabel } from '@/lib/categories';
import { useAccess } from '@/lib/access';

export interface ExpenseDraft {
  name: string;
  categoryId: string;
  amount: string;
  currency: CurrencyCode;
  rate: string;
  rateSource: RateSource;
  expenseDate: string;
  paidTo: PaidToDraft;
  paymentMethod: PaymentMethod;
  advancedBy: string;
  reimbursed: boolean;
  status: ExpenseStatus;
  dueDate: string;
  receipt: ReceiptValue | null;
  notes: string;
}

/** Today as `YYYY-MM-DD` in the phone's own time zone (the day the cost happened where the user is). */
export function todayLocal(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function emptyExpenseDraft(): ExpenseDraft {
  return {
    name: '',
    categoryId: '',
    amount: '',
    currency: 'CNY',
    rate: '',
    rateSource: 'manual',
    expenseDate: todayLocal(),
    paidTo: emptyPaidTo(),
    paymentMethod: 'cash',
    advancedBy: '',
    reimbursed: false,
    status: 'paid',
    dueDate: '',
    receipt: null,
    notes: '',
  };
}

export function draftFromExpense(expense: Expense): ExpenseDraft {
  const plain = (value: string) => value.replace(/\.?0+$/, '');
  const paidTo = expense.paidTo;
  return {
    name: expense.name,
    categoryId: expense.category.id,
    // Purchase amounts may be hidden; such expenses cannot be edited by that worker (005 FR-032).
    amount: (expense.amount ?? '').replace(/\.00$/, ''),
    currency: expense.currency,
    rate: expense.currency === 'CNY' || expense.rate === undefined ? '' : plain(expense.rate),
    rateSource: expense.rateSource,
    expenseDate: expense.expenseDate,
    paidTo:
      paidTo && 'supplier' in paidTo
        ? { mode: 'supplier', supplier: paidTo.supplier, name: '' }
        : paidTo
          ? { mode: 'name', supplier: null, name: paidTo.name }
          : emptyPaidTo(),
    paymentMethod: expense.paymentMethod,
    advancedBy: expense.advancedBy ?? '',
    reimbursed: expense.reimbursed,
    status: expense.status,
    dueDate: expense.dueDate ?? '',
    receipt: expense.receiptId
      ? {
          id: expense.receiptId,
          mime: expense.receiptMime ?? '',
          previewUrl: expense.receiptMime?.startsWith('image/') ? `/api/expenses/${expense.id}/receipt` : null,
        }
      : null,
    notes: expense.notes ?? '',
  };
}

export function draftToInput(draft: ExpenseDraft): ExpenseInput {
  const isBase = draft.currency === 'CNY';
  return {
    name: draft.name,
    categoryId: draft.categoryId,
    amount: draft.amount,
    currency: draft.currency,
    rate: isBase ? null : draft.rate || null,
    rateSource: isBase ? 'manual' : draft.rateSource,
    expenseDate: draft.expenseDate,
    ...paidToInput(draft.paidTo),
    paymentMethod: draft.paymentMethod,
    advancedBy: draft.advancedBy,
    reimbursed: draft.advancedBy.trim() ? draft.reimbursed : false,
    status: draft.status,
    dueDate: draft.status === 'to_pay' ? draft.dueDate || null : null,
    receiptId: draft.receipt?.id ?? null,
    notes: draft.notes,
  };
}

function validate(input: ExpenseInput): Record<string, ErrorCode> {
  const result = expenseInputSchema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, ErrorCode> = {};
  for (const issue of result.error.issues) errors[issue.path.map(String).join('.') || '_'] ??= issue.message as ErrorCode;
  return errors;
}

/** The CNY amount the expense will be saved with, shown live (FR-003). Null until amount and rate are valid. */
export function liveCnyAmount(draft: Pick<ExpenseDraft, 'amount' | 'currency' | 'rate'>): string | null {
  if (!isAmount(draft.amount)) return null;
  if (draft.currency !== 'CNY' && !isRate(draft.rate)) return null;
  const rate = draft.currency === 'CNY' ? RATE_SCALE : parseRate(draft.rate);
  return formatAmount(convertToCnyMinor(parseAmount(draft.amount), rate));
}

/** Shared by "Add expense" and "Edit expense". Inputs are never cleared on error (001 FR-032). */
export function ExpenseForm({
  initial,
  keepCategory,
  submitLabel,
  pending,
  error,
  onSubmit,
  cancelTo,
}: {
  initial: ExpenseDraft;
  /** On edit: the expense's current category stays selectable even if it was hidden since. */
  keepCategory?: ExpenseCategoryRef;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (input: ExpenseInput) => void;
  cancelTo: string;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const categories = useExpenseCategories();
  const [draft, setDraft] = useState<ExpenseDraft>(initial);
  const [localErrors, setLocalErrors] = useState<Record<string, ErrorCode>>({});
  const [uploading, setUploading] = useState(false);
  const serverErrors = fieldErrors(error);
  const errorFor = (path: string) => {
    const code = localErrors[path] ?? serverErrors[path];
    return code ? t(`errors.${code}`) : null;
  };
  const set = <K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const access = useAccess();
  const purchasesAllowed = !access.hidden('supplierPrices') && !access.hidden('supplierIdentity');
  const options = (categories.data ?? []).filter((c) => purchasesAllowed || c.id !== PURCHASE_CATEGORY_ID);
  if (keepCategory && !options.some((c) => c.id === keepCategory.id)) options.push({ ...keepCategory, position: 0, hidden: true });
  const cny = liveCnyAmount(draft);
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
        <Field
          label={t('expenses.form.name')}
          hint={t('expenses.form.nameHint')}
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          error={errorFor('name')}
          dir="auto"
        />
        <div>
          <Label htmlFor="expense-category">{t('expenses.form.category')}</Label>
          <Select
            id="expense-category"
            value={draft.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            aria-invalid={errorFor('categoryId') ? true : undefined}
          >
            <option value="">{t('expenses.form.chooseCategory')}</option>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabel(category, t)}
              </option>
            ))}
          </Select>
          {errorFor('categoryId') ? <p className="mt-1 text-sm text-danger">{errorFor('categoryId')}</p> : null}
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <Label htmlFor="expense-amount">{t('expenses.form.amount')}</Label>
            <MoneyInput
              id="expense-amount"
              value={draft.amount}
              onValueChange={(v) => set('amount', v)}
              aria-invalid={errorFor('amount') ? true : undefined}
            />
          </div>
          <div>
            <Label htmlFor="expense-currency">{t('expenses.form.currency')}</Label>
            <Select
              id="expense-currency"
              value={draft.currency}
              // A rate belongs to its currency: a new currency starts empty (and may be auto-filled).
              onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value as CurrencyCode, rate: '', rateSource: 'manual' }))}
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
        {draft.currency !== 'CNY' ? (
          <AutoRateField
            key={draft.currency}
            id="expense-rate"
            label={t('expenses.form.rate')}
            currency={draft.currency as ForeignCurrency}
            date={draft.expenseDate || undefined}
            value={draft.rate}
            source={draft.rateSource}
            onChange={(rate, rateSource) => setDraft((d) => ({ ...d, rate, rateSource }))}
            error={errorFor('rate')}
            autoFillWhenEmpty
          />
        ) : null}
        <p className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">
          <span className="text-muted-foreground">{t('expenses.form.cnyAmount')}</span>
          {cny ? <AmountText value={cny} currency="CNY" className="font-semibold" /> : <span>—</span>}
        </p>
        <Field
          label={t('expenses.form.date')}
          type="date"
          value={draft.expenseDate}
          onChange={(e) => set('expenseDate', e.target.value)}
          error={errorFor('expenseDate')}
        />
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium">{t('expenses.form.receipt')}</p>
          <ReceiptInput value={draft.receipt} onChange={(receipt) => set('receipt', receipt)} onBusyChange={setUploading} />
          {errorFor('receiptId') ? <p className="mt-1 text-sm text-danger">{errorFor('receiptId')}</p> : null}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <Label htmlFor="expense-status">{t('expenses.form.status')}</Label>
          <Select id="expense-status" value={draft.status} onChange={(e) => set('status', e.target.value as ExpenseStatus)}>
            {EXPENSE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`expenseStatus.${status}`)}
              </option>
            ))}
          </Select>
        </div>
        {draft.status === 'to_pay' ? (
          <Field
            label={t('expenses.form.dueDate')}
            type="date"
            value={draft.dueDate}
            onChange={(e) => set('dueDate', e.target.value)}
            error={errorFor('dueDate')}
          />
        ) : null}
        <PaidToPicker
          value={draft.paidTo}
          allowSupplier={purchasesAllowed && access.can('suppliers')}
          onChange={(paidTo) => set('paidTo', paidTo)}
          error={errorFor('paidToSupplierId') ?? errorFor('paidToName')}
        />
        <div>
          <Label htmlFor="expense-method">{t('expenses.form.paymentMethod')}</Label>
          <Select
            id="expense-method"
            value={draft.paymentMethod}
            onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {t(`paymentMethod.${method}`)}
              </option>
            ))}
          </Select>
        </div>
        <AdvancedByInput value={draft.advancedBy} onChange={(v) => set('advancedBy', v)} error={errorFor('advancedBy')} />
        {draft.advancedBy.trim() ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.reimbursed}
              onChange={(e) => set('reimbursed', e.target.checked)}
            />
            {t('expenses.form.reimbursed')}
          </label>
        ) : null}
        <div>
          <Label htmlFor="expense-notes">{t('expenses.form.notes')}</Label>
          <textarea
            id="expense-notes"
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

      {/* Sticky on phones: Save stays reachable above the keyboard and the long form. */}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          to={cancelTo}
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          {t('common.cancel')}
        </Link>
        <Button type="submit" size="lg" className="flex-1" disabled={pending || uploading}>
          {pending ? t('common.saving') : uploading ? t('expenses.receipt.waitUpload') : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** US1: "Add expense" from the order page, full screen on phones. */
export function NewExpensePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: orderId = '' } = useParams();
  const order = useOrder(orderId);
  const create = useCreateExpense(orderId);
  const backTo = `/orders/${orderId}?tab=expenses`;

  return (
    <div className="space-y-4">
      <header>
        {order.data ? (
          <p className="text-sm text-muted-foreground">
            <bdi dir="ltr">{order.data.number}</bdi> · <bdi>{order.data.title}</bdi>
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold">{t('expenses.newTitle')}</h1>
      </header>
      <ExpenseForm
        initial={emptyExpenseDraft()}
        submitLabel={t('expenses.form.save')}
        pending={create.isPending}
        error={create.error}
        cancelTo={backTo}
        onSubmit={(input) => create.mutate(input, { onSuccess: () => void navigate(backTo, { replace: true }) })}
      />
    </div>
  );
}

/** US4: correct any field of an expense (FR-007). */
export function EditExpensePage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const expense = useExpense(id);
  const update = useUpdateExpense(id);

  if (expense.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (expense.error) return <Alert tone="danger">{errorMessage(expense.error)}</Alert>;
  const e = expense.data;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('expenses.editTitle')}</h1>
      <ExpenseForm
        initial={draftFromExpense(e)}
        keepCategory={e.category}
        submitLabel={t('expenses.form.save')}
        pending={update.isPending}
        error={update.error}
        cancelTo={`/expenses/${e.id}`}
        onSubmit={(input) => update.mutate(input, { onSuccess: () => void navigate(`/expenses/${e.id}`, { replace: true }) })}
      />
    </div>
  );
}
