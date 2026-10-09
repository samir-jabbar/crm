import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { SupplierPicker, type PickedEntity } from '@/components/AddressPicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface PaidToDraft {
  mode: 'supplier' | 'name';
  supplier: PickedEntity | null;
  name: string;
}

export const emptyPaidTo = (): PaidToDraft => ({ mode: 'supplier', supplier: null, name: '' });

/** At most one of the two is sent (data-model.md): a supplier from the address book, or a typed name. */
export function paidToInput(draft: PaidToDraft): { paidToSupplierId: string | null; paidToName: string | null } {
  return draft.mode === 'supplier'
    ? { paidToSupplierId: draft.supplier?.id ?? null, paidToName: null }
    : { paidToSupplierId: null, paidToName: draft.name.trim() || null };
}

/** "Paid to" (003 FR-001): a supplier (picked or created inline) or any typed name, e.g. "Driver Li". */
export function PaidToPicker({
  value,
  onChange,
  error,
  allowSupplier = true,
}: {
  value: PaidToDraft;
  onChange: (value: PaidToDraft) => void;
  error?: string | null;
  /** 005: off for workers who may not see suppliers or supplier purchases; only a typed name is offered. */
  allowSupplier?: boolean;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const groupId = useId();
  const choice = (mode: PaidToDraft['mode'], label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value.mode === mode}
      onClick={() => onChange({ ...value, mode })}
      className={cn(
        'min-h-11 flex-1 rounded-md px-3 text-sm font-medium',
        value.mode === mode ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <fieldset className="space-y-2">
      <legend id={groupId} className="mb-1 text-sm font-medium">
        {t('expenses.form.paidTo')}
      </legend>
      {allowSupplier ? (
        <div role="radiogroup" aria-labelledby={groupId} className="flex gap-1 rounded-lg bg-muted p-1">
          {choice('supplier', t('expenses.form.paidToSupplier'))}
          {choice('name', t('expenses.form.paidToName'))}
        </div>
      ) : null}
      {allowSupplier && value.mode === 'supplier' ? (
        <SupplierPicker
          label={t('expenses.form.paidToSupplierLabel')}
          value={value.supplier}
          onSelect={(supplier) => onChange({ ...value, supplier })}
          error={error}
        />
      ) : (
        <div>
          <Label htmlFor={nameId}>{t('expenses.form.paidToNameLabel')}</Label>
          <Input
            id={nameId}
            value={value.name}
            maxLength={120}
            placeholder={t('expenses.form.paidToNamePlaceholder')}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            aria-invalid={error ? true : undefined}
            dir="auto"
          />
          {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
        </div>
      )}
    </fieldset>
  );
}
