import {
  CURRENCY_CODES,
  formatAmount,
  INCOTERMS,
  isAmount,
  orderInputSchema,
  parseAmount,
  sumMinor,
  type CurrencyCode,
  type ErrorCode,
  type Incoterm,
  type Order,
  type OrderInput,
} from '@hanjing/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { ApiError } from '@/api/http';
import { CustomerPicker, type PickedEntity } from '@/components/AddressPicker';
import { AmountText } from '@/components/AmountText';
import { Field } from '@/components/Field';
import { draftLineTotalMinor, ItemsEditor, newItemDraft, type ItemDraft } from '@/components/ItemsEditor';
import { MoneyInput } from '@/components/MoneyInput';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Suggested destination ports (spec Assumptions); any other port can be typed. */
export const PORT_SUGGESTIONS = ['Casablanca', 'Tanger Med', 'Agadir', 'Nador', 'Jorf Lasfar', 'Dakar', 'Abidjan'];

export interface OrderDraft {
  title: string;
  customer: PickedEntity | null;
  deliveryCity: string;
  agreedPrice: string;
  currency: CurrencyCode;
  incoterm: Incoterm | '';
  destinationPort: string;
  expectedDeliveryDate: string;
  budgetCny: string;
  items: ItemDraft[];
}

export function emptyOrderDraft(customer: PickedEntity | null = null): OrderDraft {
  return {
    title: '',
    customer,
    deliveryCity: customer?.city ?? '',
    agreedPrice: '',
    currency: 'USD',
    incoterm: '',
    destinationPort: '',
    expectedDeliveryDate: '',
    budgetCny: '',
    items: [newItemDraft()],
  };
}

export function draftFromOrder(order: Order): OrderDraft {
  const plain = (amount: string) => amount.replace(/\.00$/, '');
  return {
    title: order.title,
    customer: { id: order.customer.id, name: order.customer.name },
    deliveryCity: order.deliveryCity ?? '',
    agreedPrice: plain(order.agreedPrice),
    currency: order.currency,
    incoterm: order.incoterm ?? '',
    destinationPort: order.destinationPort ?? '',
    expectedDeliveryDate: order.expectedDeliveryDate ?? '',
    budgetCny: order.budgetCny ? plain(order.budgetCny) : '',
    items: order.items.map((item) => ({
      key: item.id,
      id: item.id,
      productName: item.productName,
      brandModel: item.brandModel ?? '',
      year: item.year ? String(item.year) : '',
      quantity: String(item.quantity),
      unitPrice: plain(item.unitPrice),
      hsCode: item.hsCode ?? '',
      specs: item.specs ?? '',
      supplier: item.supplier,
    })),
  };
}

export function draftToInput(draft: OrderDraft): OrderInput {
  return {
    title: draft.title,
    customerId: draft.customer?.id ?? '',
    deliveryCity: draft.deliveryCity,
    agreedPrice: draft.agreedPrice,
    currency: draft.currency,
    incoterm: draft.incoterm || null,
    destinationPort: draft.destinationPort,
    expectedDeliveryDate: draft.expectedDeliveryDate || null,
    budgetCny: draft.budgetCny || null,
    items: draft.items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      productName: item.productName,
      brandModel: item.brandModel,
      year: item.year ? Number(item.year) : null,
      quantity: item.quantity === '' ? Number.NaN : Number(item.quantity),
      unitPrice: item.unitPrice,
      hsCode: item.hsCode,
      specs: item.specs,
      supplierId: item.supplier?.id ?? null,
    })),
  };
}

/** Client-side check with the same shared schema as the server; returns field path → error code. */
function validate(input: OrderInput): Record<string, ErrorCode> {
  const result = orderInputSchema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, ErrorCode> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    errors[key] ??= issue.message as ErrorCode;
  }
  return errors;
}

/** Shared by "New order" and "Edit order" (US1, US2). Inputs are never cleared on error (001 FR-032). */
export function OrderForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial: OrderDraft;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (input: OrderInput) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [draft, setDraft] = useState<OrderDraft>(initial);
  const [localErrors, setLocalErrors] = useState<Record<string, ErrorCode>>({});
  const serverErrors = fieldErrors(error);
  const errorFor = (path: string) => {
    const code = localErrors[path] ?? serverErrors[path];
    return code ? t(`errors.${code}`) : null;
  };
  const set = <K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const lineTotals = draft.items.map(draftLineTotalMinor);
  const itemsTotal = sumMinor(lineTotals.map((v) => v ?? 0));
  const difference = isAmount(draft.agreedPrice) ? parseAmount(draft.agreedPrice) - itemsTotal : null;
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
    <form className="space-y-5" onSubmit={submit} noValidate>
      <Card className="space-y-4">
        <Field
          label={t('orders.form.title')}
          hint={t('orders.form.titleHint')}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          error={errorFor('title')}
          dir="auto"
        />
        <CustomerPicker
          label={t('orders.form.customer')}
          value={draft.customer}
          onSelect={(customer) =>
            setDraft((d) => ({
              ...d,
              customer,
              // Pre-fill the delivery city from the customer, unless the user already typed one.
              deliveryCity: d.deliveryCity || customer?.city || '',
            }))
          }
          error={errorFor('customerId')}
        />
        <Field
          label={t('orders.form.deliveryCity')}
          value={draft.deliveryCity}
          onChange={(e) => set('deliveryCity', e.target.value)}
          error={errorFor('deliveryCity')}
          dir="auto"
        />
      </Card>

      <Card className="space-y-4">
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <Label htmlFor="order-price">{t('orders.form.agreedPrice')}</Label>
            <MoneyInput
              id="order-price"
              value={draft.agreedPrice}
              onValueChange={(v) => set('agreedPrice', v)}
              aria-invalid={errorFor('agreedPrice') ? true : undefined}
            />
          </div>
          <div>
            <Label htmlFor="order-currency">{t('orders.form.currency')}</Label>
            <Select id="order-currency" value={draft.currency} onChange={(e) => set('currency', e.target.value as CurrencyCode)}>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {errorFor('agreedPrice') ? <p className="text-sm text-danger">{errorFor('agreedPrice')}</p> : null}
        <p className="text-xs text-muted-foreground">{t('orders.form.agreedPriceHint')}</p>
        <div>
          <Label htmlFor="order-incoterm">{t('orders.form.incoterm')}</Label>
          <Select id="order-incoterm" value={draft.incoterm} onChange={(e) => set('incoterm', e.target.value as Incoterm | '')}>
            <option value="">—</option>
            {INCOTERMS.map((code) => (
              <option key={code} value={code}>
                {code} — {t(`incoterm.${code}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Field
            label={t('orders.form.destinationPort')}
            value={draft.destinationPort}
            onChange={(e) => set('destinationPort', e.target.value)}
            error={errorFor('destinationPort')}
            list="port-suggestions"
            dir="auto"
          />
          <datalist id="port-suggestions">
            {PORT_SUGGESTIONS.map((port) => (
              <option key={port} value={port} />
            ))}
          </datalist>
        </div>
        <Field
          label={t('orders.form.expectedDeliveryDate')}
          type="date"
          value={draft.expectedDeliveryDate}
          onChange={(e) => set('expectedDeliveryDate', e.target.value)}
          error={errorFor('expectedDeliveryDate')}
        />
        <div>
          <Label htmlFor="order-budget">{t('orders.form.budgetCny')}</Label>
          <MoneyInput
            id="order-budget"
            value={draft.budgetCny}
            onValueChange={(v) => set('budgetCny', v)}
            aria-invalid={errorFor('budgetCny') ? true : undefined}
          />
          <p className="mt-1 text-xs text-muted-foreground">{errorFor('budgetCny') ?? t('orders.form.budgetHint')}</p>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('orders.items.title')}</h2>
        <ItemsEditor items={draft.items} currency={draft.currency} onChange={(items) => set('items', items)} errorFor={errorFor} />
      </section>

      <Card className="space-y-1" aria-live="polite">
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t('orders.itemsTotal')}</span>
          <AmountText value={formatAmount(itemsTotal)} currency={draft.currency} className="font-medium" />
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">{t('orders.difference')}</span>
          {difference === null ? (
            <span>—</span>
          ) : (
            <AmountText value={formatAmount(difference)} currency={draft.currency} signed className="font-medium" />
          )}
        </p>
        <p className="text-xs text-muted-foreground">{t('orders.differenceHint')}</p>
      </Card>

      {Object.keys(localErrors).length > 0 || (error instanceof ApiError && error.code === 'validation_failed') ? (
        <Alert tone="danger">{t('errors.validation_failed')}</Alert>
      ) : null}
      {otherError ? <Alert tone="danger">{otherError}</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t('common.saving') : submitLabel}
      </Button>
    </form>
  );
}
