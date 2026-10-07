import type { Customer, Supplier } from '@hanjing/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  useCustomer,
  useCustomerMutations,
  useCustomerOrders,
  useCustomers,
  useSupplier,
  useSupplierMutations,
  useSupplierOrders,
  useSuppliers,
} from '@/api/addressBook';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { ApiError } from '@/api/http';
import { AmountText } from '@/components/AmountText';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { Field } from '@/components/Field';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebounced } from '@/lib/useDebounced';

export type Kind = 'customers' | 'suppliers';
type Entity = Customer | Supplier;
type FieldKey = 'name' | 'company' | 'contactPerson' | 'phone' | 'wechat' | 'email' | 'city' | 'country' | 'notes';

/** Fields per kind, in display order (FR-001, FR-005). */
const FIELDS: Record<Kind, FieldKey[]> = {
  customers: ['name', 'company', 'city', 'country', 'phone', 'email', 'notes'],
  suppliers: ['name', 'company', 'contactPerson', 'phone', 'wechat', 'email', 'city', 'country', 'notes'],
};
const LTR_FIELDS = new Set<FieldKey>(['phone', 'email', 'wechat']);

function useKind(kind: Kind) {
  const customers = useCustomerMutations();
  const suppliers = useSupplierMutations();
  return kind === 'customers' ? customers : suppliers;
}

function useEntityList(kind: Kind, q: string, deleted: boolean) {
  const customers = useCustomers(kind === 'customers' ? q : '', deleted);
  const suppliers = useSuppliers(kind === 'suppliers' ? q : '', deleted);
  return kind === 'customers' ? customers : suppliers;
}

function useEntity(kind: Kind, id: string | undefined, deleted = false) {
  const customer = useCustomer(kind === 'customers' ? id : undefined, deleted);
  const supplier = useSupplier(kind === 'suppliers' ? id : undefined, deleted);
  return kind === 'customers' ? customer : supplier;
}

function useEntityOrders(kind: Kind, id: string | undefined) {
  const customer = useCustomerOrders(kind === 'customers' ? id : undefined);
  const supplier = useSupplierOrders(kind === 'suppliers' ? id : undefined);
  return kind === 'customers' ? customer : supplier;
}

// ── List ───────────────────────────────────────────────────────────────────

export function AddressListPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [text, setText] = useState('');
  const q = useDebounced(text);
  const [deleted, setDeleted] = useState(false);
  const list = useEntityList(kind, q, deleted);
  const { restore } = useKind(kind);
  const items = (list.data?.pages.flatMap((p) => p.items) ?? []) as Entity[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{deleted ? t(`addressBook.${kind}.deletedTitle`) : t(`nav.${kind}`)}</h1>
        <Link
          to={`/${kind}/new`}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t(`addressBook.${kind}.new`)}
        </Link>
      </div>
      <Input
        type="search"
        aria-label={t(`addressBook.${kind}.search`)}
        placeholder={t('addressBook.searchPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        dir="auto"
      />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={deleted} onChange={(e) => setDeleted(e.target.checked)} />
        {t(`addressBook.${kind}.showDeleted`)}
      </label>

      {list.error ? <Alert tone="danger">{errorMessage(list.error)}</Alert> : null}
      {restore.error ? <Alert tone="danger">{errorMessage(restore.error)}</Alert> : null}
      {list.isPending ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {list.data && items.length === 0 ? <p className="text-sm text-muted-foreground">{t('addressBook.empty')}</p> : null}

      <ul className="space-y-3">
        {items.map((entity) => {
          const body = (
            <Card className="space-y-1">
              <p className="font-semibold" dir="auto">
                {entity.name}
              </p>
              {entity.company ? (
                <p className="text-sm text-muted-foreground" dir="auto">
                  {entity.company}
                </p>
              ) : null}
              <p className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                <span dir="auto">{[entity.city, entity.country].filter(Boolean).join(', ') || '—'}</span>
                <span>{t('addressBook.orderCount', { count: entity.orderCount })}</span>
              </p>
            </Card>
          );
          return (
            <li key={entity.id}>
              {deleted ? (
                <div className="space-y-2">
                  {body}
                  <Button variant="secondary" onClick={() => restore.mutate(entity.id)} disabled={restore.isPending}>
                    {t('addressBook.restore')}
                  </Button>
                </div>
              ) : (
                <Link to={`/${kind}/${entity.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {list.hasNextPage ? (
        <Button variant="secondary" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          {t('common.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

// ── Form (new / edit) ──────────────────────────────────────────────────────

function EntityForm({ kind, entity }: { kind: Kind; entity?: Entity }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const { create, update } = useKind(kind);
  const mutation = entity ? update : create;
  const fields = FIELDS[kind];
  const [values, setValues] = useState<Record<FieldKey, string>>(() => {
    const initial = Object.fromEntries(fields.map((f) => [f, ''])) as Record<FieldKey, string>;
    if (entity) for (const f of fields) initial[f] = ((entity as unknown as Record<string, string | null>)[f] ?? '') as string;
    else initial.country = kind === 'customers' ? t('addressBook.defaultCountryCustomer') : t('addressBook.defaultCountrySupplier');
    return initial;
  });
  const [duplicate, setDuplicate] = useState(false);
  const serverErrors = fieldErrors(mutation.error);

  function save(confirmDuplicate: boolean) {
    const body = Object.fromEntries(fields.map((f) => [f, values[f]]));
    const onSuccess = (saved: unknown) => void navigate(`/${kind}/${(saved as Entity).id}`, { replace: true });
    const onError = (error: Error) => {
      if (error instanceof ApiError && error.code === 'customer_name_exists') setDuplicate(true);
    };
    if (entity) update.mutate({ id: entity.id, body } as never, { onSuccess, onError });
    else create.mutate((kind === 'customers' ? { ...body, confirmDuplicate } : body) as never, { onSuccess, onError });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDuplicate(false);
    save(false);
  }

  const otherError =
    mutation.error && !(mutation.error instanceof ApiError && ['validation_failed', 'customer_name_exists'].includes(mutation.error.code))
      ? errorMessage(mutation.error)
      : null;

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <Card className="space-y-4">
        {fields.map((f) =>
          f === 'notes' ? (
            <div key={f}>
              <Label htmlFor={`entity-${f}`}>{t(`addressBook.${f}`)}</Label>
              <textarea
                id={`entity-${f}`}
                value={values[f]}
                onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                rows={4}
                dir="auto"
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
              />
              {serverErrors[f] ? <p className="mt-1 text-sm text-danger">{t(`errors.${serverErrors[f]}`)}</p> : null}
            </div>
          ) : (
            <Field
              key={f}
              label={t(`addressBook.${f}`)}
              value={values[f]}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
              error={serverErrors[f] ? t(`errors.${serverErrors[f]}`) : null}
              type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'}
              dir={LTR_FIELDS.has(f) ? 'ltr' : 'auto'}
            />
          ),
        )}
      </Card>
      {duplicate ? (
        <Alert tone="warning">
          <p>{t('errors.customer_name_exists')}</p>
          <Button className="mt-2" variant="secondary" onClick={() => save(true)} disabled={mutation.isPending}>
            {t('addressBook.createAnyway')}
          </Button>
        </Alert>
      ) : null}
      {otherError ? <Alert tone="danger">{otherError}</Alert> : null}
      <Button type="submit" size="lg" disabled={mutation.isPending}>
        {mutation.isPending ? t('common.saving') : t('common.save')}
      </Button>
    </form>
  );
}

export function AddressFormPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id } = useParams();
  const entity = useEntity(kind, id);
  if (id && entity.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (id && entity.error) return <Alert tone="danger">{errorMessage(entity.error)}</Alert>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{id ? t(`addressBook.${kind}.edit`) : t(`addressBook.${kind}.new`)}</h1>
      <EntityForm kind={kind} entity={id ? (entity.data as Entity) : undefined} />
    </div>
  );
}

// ── Detail ─────────────────────────────────────────────────────────────────

export function AddressDetailPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const { id } = useParams();
  const entity = useEntity(kind, id);
  const orders = useEntityOrders(kind, id);
  const { remove } = useKind(kind);

  if (entity.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (entity.error) return <Alert tone="danger">{errorMessage(entity.error)}</Alert>;
  const e = entity.data as Entity;
  const record = e as unknown as Record<string, string | null>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold" dir="auto">
        {e.name}
      </h1>
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/${kind}/${e.id}/edit`}
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          {t('orders.actions.edit')}
        </Link>
        {kind === 'customers' ? (
          <Link
            to={`/orders/new?customerId=${e.id}`}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t('addressBook.customers.newOrder')}
          </Link>
        ) : null}
        <ConfirmDelete
          title={t(`addressBook.${kind}.deleteTitle`)}
          body={t('addressBook.deleteBody')}
          pending={remove.isPending}
          error={remove.error}
          onReset={() => remove.reset()}
          onConfirm={() => remove.mutate(e.id, { onSuccess: () => void navigate(`/${kind}`, { replace: true }) })}
        />
      </div>

      <Card>
        <dl className="divide-y divide-border text-sm">
          {FIELDS[kind]
            .filter((f) => f !== 'name' && record[f])
            .map((f) => (
              <div key={f} className="flex justify-between gap-3 py-1.5">
                <dt className="text-muted-foreground">{t(`addressBook.${f}`)}</dt>
                <dd className="min-w-0 whitespace-pre-line text-end" dir={LTR_FIELDS.has(f) ? 'ltr' : 'auto'}>
                  {f === 'phone' ? (
                    <a href={`tel:${record[f]}`} className="text-primary">
                      {record[f]}
                    </a>
                  ) : f === 'email' ? (
                    <a href={`mailto:${record[f]}`} className="text-primary">
                      {record[f]}
                    </a>
                  ) : (
                    record[f]
                  )}
                </dd>
              </div>
            ))}
        </dl>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('nav.orders')}</h2>
        {orders.data && orders.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('addressBook.noOrders')}</p>
        ) : null}
        <ul className="space-y-2">
          {orders.data?.items.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
                <Card className="space-y-1 text-sm">
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {o.number}
                  </p>
                  <p className="font-medium" dir="auto">
                    {o.title}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge status={o.status} />
                    <AmountText value={o.agreedPrice} currency={o.currency} />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
