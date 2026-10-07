import type { Customer, Supplier } from '@hanjing/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustomerMutations, useCustomers, useSupplierMutations, useSuppliers } from '@/api/addressBook';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { ApiError } from '@/api/http';
import { Field } from '@/components/Field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebounced } from '@/lib/useDebounced';

export interface PickedEntity {
  id: string;
  name: string;
  city?: string | null;
}

type Kind = 'customers' | 'suppliers';

interface PickerProps {
  label: string;
  value: PickedEntity | null;
  onSelect: (value: PickedEntity | null) => void;
  error?: string | null;
  /** Filter mode: no "create" option (order list filters). */
  allowCreate?: boolean;
}

function CreateDialog({
  kind,
  initialName,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: Kind;
  initialName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (entity: Customer | Supplier) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const customerMutations = useCustomerMutations();
  const supplierMutations = useSupplierMutations();
  const create = kind === 'customers' ? customerMutations.create : supplierMutations.create;
  const [values, setValues] = useState({
    name: initialName,
    city: '',
    country: kind === 'customers' ? t('addressBook.defaultCountryCustomer') : t('addressBook.defaultCountrySupplier'),
    phone: '',
    contactPerson: '',
    wechat: '',
  });
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const set = (name: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));
  const fields = fieldErrors(create.error);

  function submit(confirmDuplicate: boolean) {
    const base = { name: values.name, city: values.city, country: values.country, phone: values.phone };
    const body =
      kind === 'customers'
        ? { ...base, confirmDuplicate }
        : { ...base, contactPerson: values.contactPerson, wechat: values.wechat };
    create.mutate(body as never, {
      onSuccess: (entity) => {
        setDuplicateOf(null);
        onCreated(entity as Customer | Supplier);
        onOpenChange(false);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'customer_name_exists') setDuplicateOf(values.name);
      },
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // never submit the surrounding order form
    submit(false);
  }

  const otherError =
    create.error && !(create.error instanceof ApiError && ['validation_failed', 'customer_name_exists'].includes(create.error.code))
      ? errorMessage(create.error)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={kind === 'customers' ? t('addressBook.newCustomer') : t('addressBook.newSupplier')}>
        <form className="space-y-3" onSubmit={onSubmit} noValidate>
          <Field
            label={t('addressBook.name')}
            value={values.name}
            onChange={set('name')}
            error={fields.name ? t(`errors.${fields.name}`) : null}
            dir="auto"
            autoFocus
          />
          {kind === 'suppliers' ? (
            <>
              <Field label={t('addressBook.contactPerson')} value={values.contactPerson} onChange={set('contactPerson')} dir="auto" />
              <Field label={t('addressBook.wechat')} value={values.wechat} onChange={set('wechat')} dir="ltr" />
            </>
          ) : null}
          <Field label={t('addressBook.city')} value={values.city} onChange={set('city')} dir="auto" />
          <Field label={t('addressBook.country')} value={values.country} onChange={set('country')} dir="auto" />
          <Field label={t('addressBook.phone')} value={values.phone} onChange={set('phone')} type="tel" dir="ltr" />
          {duplicateOf ? (
            <Alert tone="warning">
              <p>{t('errors.customer_name_exists')}</p>
              <Button className="mt-2" variant="secondary" onClick={() => submit(true)} disabled={create.isPending}>
                {t('addressBook.createAnyway')}
              </Button>
            </Alert>
          ) : null}
          {otherError ? <Alert tone="danger">{otherError}</Alert> : null}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddressPicker({ kind, label, value, onSelect, error, allowCreate = true }: PickerProps & { kind: Kind }) {
  const { t } = useTranslation();
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(text);
  const customers = useCustomers(kind === 'customers' ? q : '', false);
  const suppliers = useSuppliers(kind === 'suppliers' ? q : '', false);
  const results = (kind === 'customers' ? customers : suppliers).data?.pages[0]?.items.slice(0, 8) ?? [];

  if (value) {
    return (
      <div>
        <Label htmlFor={inputId}>{label}</Label>
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3">
          <span id={inputId} className="min-w-0 truncate font-medium" dir="auto">
            {value.name}
          </span>
          <Button variant="ghost" onClick={() => onSelect(null)}>
            {t('addressBook.change')}
          </Button>
        </div>
        {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  const trimmed = text.trim();
  return (
    <div className="relative">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={error ? true : undefined}
        value={text}
        placeholder={t('addressBook.searchPlaceholder')}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        dir="auto"
        autoComplete="off"
      />
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
      {open && (results.length > 0 || (allowCreate && trimmed)) ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-surface shadow-lg"
        >
          {results.map((r) => (
            <li key={r.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect({ id: r.id, name: r.name, city: r.city });
                  setText('');
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate" dir="auto">
                  {r.name}
                </span>
                {r.city ? (
                  <span className="shrink-0 text-xs text-muted-foreground" dir="auto">
                    {r.city}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {allowCreate && trimmed ? (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center px-3 text-start font-medium text-primary hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setCreating(true);
                  setOpen(false);
                }}
              >
                {t('addressBook.createNamed', { name: trimmed })}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {creating ? (
        <CreateDialog
          kind={kind}
          initialName={trimmed}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(entity) => {
            onSelect({ id: entity.id, name: entity.name, city: entity.city });
            setText('');
          }}
        />
      ) : null}
    </div>
  );
}

export const CustomerPicker = (props: PickerProps) => <AddressPicker kind="customers" {...props} />;
export const SupplierPicker = (props: PickerProps) => <AddressPicker kind="suppliers" {...props} />;
