import {
  ORDER_STATUSES,
  type CurrencyCode,
  type Module,
  type Order,
  type OrderStatus,
} from '@hanjing/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { ApiError } from '@/api/http';
import { useDeleteOrder, useDuplicateOrder, useOrder, useSetOrderStatus } from '@/api/orders';
import { AmountText } from '@/components/AmountText';
import { ComingSoon } from '@/components/ComingSoon';
import { CloseOrderDialog } from '@/components/CloseOrderDialog';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { FinancialSummary } from '@/components/FinancialSummary';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/i18n/format';
import { useAccess } from '@/lib/access';
import { cn } from '@/lib/utils';
import { ExpensesTab } from './ExpensesTab';
import { PaymentsTab } from './PaymentsTab';
import { NotesTab } from './NotesTab';
import { AssigneesPanel } from './AssigneesPanel';

export const ORDER_TABS = [
  'overview',
  'expenses',
  'payments',
  'shipment',
  'documents',
  'invoices',
  'notes',
  'reminders',
] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/** 005 FR-012: the module each tab belongs to; a tab shows only to users who may use its module. */
const TAB_MODULE: Record<OrderTab, Module | 'payments'> = {
  overview: 'orders',
  expenses: 'expenses',
  payments: 'payments',
  shipment: 'shipments',
  documents: 'documents',
  invoices: 'invoices',
  notes: 'orders',
  reminders: 'orders',
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end" dir="auto">
        {children}
      </dd>
    </div>
  );
}

export function OrderOverview({ order }: { order: Order }) {
  const { t, i18n } = useTranslation();
  // 005: the customer page is linked only for users with the Customers module.
  const canSeeCustomers = useAccess().can('customers');
  return (
    <div className="space-y-4">
      <Card>
        <dl className="divide-y divide-border text-sm">
          <Detail label={t('orders.form.customer')}>
            {canSeeCustomers ? (
              <Link to={`/customers/${order.customer.id}`} className="text-primary underline-offset-2 hover:underline">
                {order.customer.name}
              </Link>
            ) : (
              order.customer.name
            )}
          </Detail>
          <Detail label={t('orders.form.deliveryCity')}>{order.deliveryCity ?? '—'}</Detail>
          <Detail label={t('orders.form.incoterm')}>
            {order.incoterm ? `${order.incoterm} — ${t(`incoterm.${order.incoterm}`)}` : '—'}
          </Detail>
          <Detail label={t('orders.form.destinationPort')}>{order.destinationPort ?? '—'}</Detail>
          <Detail label={t('orders.form.expectedDeliveryDate')}>
            {order.expectedDeliveryDate
              ? formatDateTime(`${order.expectedDeliveryDate}T00:00:00`, i18n.language, {
                  dateStyle: 'medium',
                })
              : '—'}
          </Detail>
          <Detail label={t('orders.createdAt')}>{formatDateTime(order.createdAt, i18n.language)}</Detail>
        </dl>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('orders.items.title')}</h2>
        {order.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('orders.items.none')}</p>
        ) : null}
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id}>
              <Card className="text-sm">
                <p className="font-medium" dir="auto">
                  {item.productName}
                  {item.brandModel ? (
                    <span className="text-muted-foreground"> · {item.brandModel}</span>
                  ) : null}
                  {item.year ? <span className="text-muted-foreground"> · {item.year}</span> : null}
                </p>
                <p className="mt-1 flex flex-wrap justify-between gap-2">
                  <span>
                    {item.quantity}
                    {item.unitPrice !== undefined ? (
                      <>
                        {' × '}
                        <AmountText value={item.unitPrice} currency={order.currency} />
                      </>
                    ) : null}
                  </span>
                  <AmountText value={item.lineTotal} currency={order.currency} className="font-medium" />
                </p>
                {item.supplier || item.hsCode ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.supplier ? (
                      <Link
                        to={`/suppliers/${item.supplier.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        <bdi>{item.supplier.name}</bdi>
                      </Link>
                    ) : null}
                    {item.supplier && item.hsCode ? ' · ' : null}
                    {item.hsCode ? `HS ${item.hsCode}` : null}
                  </p>
                ) : null}
                {item.specs ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground" dir="auto">
                    {item.specs}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The order control center (FR-015). Later features replace the "coming soon" tabs. */
export function OrderDetailPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const access = useAccess();
  const tabs = ORDER_TABS.filter((key) => access.can(TAB_MODULE[key]));
  const asked = params.get('tab') ?? 'overview';
  const tab: OrderTab | undefined = (tabs as readonly string[]).includes(asked)
    ? (asked as OrderTab)
    : tabs[0];
  const full = access.can('orders');
  const order = useOrder(id);
  const setStatus = useSetOrderStatus(id ?? '');
  // 004 FR-022: the server refuses to close an order still owed money until the user confirms.
  const [outstanding, setOutstanding] = useState<{ remaining: string; currency: CurrencyCode } | null>(null);
  const changeStatus = (status: OrderStatus) =>
    setStatus.mutate(status, {
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'balance_outstanding') {
          setOutstanding({
            remaining: error.details.remaining ?? '0',
            currency: error.details.currency ?? 'CNY',
          });
        }
      },
    });
  const duplicate = useDuplicateOrder(id ?? '');
  const remove = useDeleteOrder();
  const navigate = useNavigate();

  if (order.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (order.error) return <Alert tone="danger">{errorMessage(order.error)}</Alert>;
  const o = order.data;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground" dir="ltr">
          {o.number}
        </p>
        <h1 className="text-2xl font-semibold" dir="auto">
          {o.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          <span className="text-sm" dir="auto">
            {o.customer.name}
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {full && access.can('orders', 'edit') ? (
            <div className="min-w-48 flex-1">
              <label htmlFor="order-status" className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('orders.status')}
              </label>
              <Select
                id="order-status"
                value={o.status}
                disabled={setStatus.isPending}
                onChange={(e) => changeStatus(e.target.value as OrderStatus)}
              >
                {/* 005 FR-032: closing needs the remaining amount visible. */}
                {ORDER_STATUSES.filter(
                  (status) => status !== 'closed' || access.figure('remaining') || o.status === 'closed',
                ).map((status) => (
                  <option key={status} value={status}>
                    {t(`orderStatus.${status}`)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {full && access.can('orders', 'edit') ? (
            <Link
              to={`/orders/${o.id}/edit`}
              className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
            >
              {t('orders.actions.edit')}
            </Link>
          ) : null}
          {full && access.can('orders', 'create') ? (
            <Button
              variant="secondary"
              disabled={duplicate.isPending}
              onClick={() =>
                duplicate.mutate(t('orders.copySuffix'), {
                  onSuccess: (copy) => void navigate(`/orders/${copy.id}`),
                })
              }
            >
              {t('orders.actions.duplicate')}
            </Button>
          ) : null}
          {access.can('orders', 'delete') ? (
            <ConfirmDelete
              title={t('orders.delete.title')}
              body={t('orders.delete.body')}
              pending={remove.isPending}
              error={remove.error}
              onReset={() => remove.reset()}
              onConfirm={() =>
                remove.mutate(o.id, { onSuccess: () => void navigate('/orders', { replace: true }) })
              }
            />
          ) : null}
        </div>
        {setStatus.error &&
        !(setStatus.error instanceof ApiError && setStatus.error.code === 'balance_outstanding') ? (
          <Alert tone="danger">{errorMessage(setStatus.error)}</Alert>
        ) : null}
        <CloseOrderDialog
          outstanding={outstanding}
          pending={setStatus.isPending}
          onCancel={() => {
            setOutstanding(null);
            setStatus.reset();
          }}
          onConfirm={() =>
            setStatus.mutate(
              { status: 'closed', confirmOutstanding: true },
              { onSuccess: () => setOutstanding(null) },
            )
          }
        />
        {duplicate.error ? <Alert tone="danger">{errorMessage(duplicate.error)}</Alert> : null}
      </header>

      {/* 005 FR-025: the price card is the selling price group. */}
      {full && !access.hidden('sellingPrice') ? (
        <Card className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">{t('orders.form.agreedPrice')}</p>
            <AmountText value={o.agreedPrice} currency={o.currency} className="text-base font-semibold" />
          </div>
          <div>
            <p className="text-muted-foreground">{t('orders.itemsTotal')}</p>
            <AmountText value={o.itemsTotal} currency={o.currency} />
          </div>
          <div>
            <p className="text-muted-foreground">{t('orders.difference')}</p>
            <AmountText value={o.priceDifference} currency={o.currency} signed />
          </div>
          <div>
            <p className="text-muted-foreground">{t('orders.form.budgetCny')}</p>
            {o.budgetCny ? <AmountText value={o.budgetCny} currency="CNY" /> : <span>—</span>}
          </div>
        </Card>
      ) : null}

      {full ? <FinancialSummary order={o} /> : null}

      {access.owner ? <AssigneesPanel orderId={o.id} /> : null}

      <nav aria-label={t('orders.tabs.label')} className="-mx-4 overflow-x-auto px-4">
        <div role="tablist" className="flex min-w-max gap-1 border-b border-border">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setParams(key === 'overview' ? {} : { tab: key }, { replace: true })}
              className={cn(
                'min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-medium',
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`orders.tabs.${key}`)}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel">
        {tab === undefined ? null : tab === 'overview' ? (
          <OrderOverview order={o} />
        ) : tab === 'expenses' ? (
          <ExpensesTab orderId={o.id} />
        ) : tab === 'payments' ? (
          <PaymentsTab orderId={o.id} />
        ) : tab === 'notes' ? (
          <NotesTab orderId={o.id} />
        ) : (
          <ComingSoon title={t(`orders.tabs.${tab}`)} />
        )}
      </div>
    </div>
  );
}
