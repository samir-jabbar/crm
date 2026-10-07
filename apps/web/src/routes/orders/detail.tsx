import { ORDER_STATUSES, type Order, type OrderStatus } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useDeleteOrder, useDuplicateOrder, useOrder, useSetOrderStatus } from '@/api/orders';
import { AmountText } from '@/components/AmountText';
import { ComingSoon } from '@/components/ComingSoon';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/i18n/format';
import { cn } from '@/lib/utils';
import { NotesTab } from './NotesTab';

export const ORDER_TABS = ['overview', 'expenses', 'payments', 'shipment', 'documents', 'invoices', 'notes', 'reminders'] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

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
  return (
    <div className="space-y-4">
      <Card>
        <dl className="divide-y divide-border text-sm">
          <Detail label={t('orders.form.customer')}>
            <Link to={`/customers/${order.customer.id}`} className="text-primary underline-offset-2 hover:underline">
              {order.customer.name}
            </Link>
          </Detail>
          <Detail label={t('orders.form.deliveryCity')}>{order.deliveryCity ?? '—'}</Detail>
          <Detail label={t('orders.form.incoterm')}>{order.incoterm ? `${order.incoterm} — ${t(`incoterm.${order.incoterm}`)}` : '—'}</Detail>
          <Detail label={t('orders.form.destinationPort')}>{order.destinationPort ?? '—'}</Detail>
          <Detail label={t('orders.form.expectedDeliveryDate')}>
            {order.expectedDeliveryDate
              ? formatDateTime(`${order.expectedDeliveryDate}T00:00:00`, i18n.language, { dateStyle: 'medium' })
              : '—'}
          </Detail>
          <Detail label={t('orders.createdAt')}>{formatDateTime(order.createdAt, i18n.language)}</Detail>
        </dl>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('orders.items.title')}</h2>
        {order.items.length === 0 ? <p className="text-sm text-muted-foreground">{t('orders.items.none')}</p> : null}
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id}>
              <Card className="text-sm">
                <p className="font-medium" dir="auto">
                  {item.productName}
                  {item.brandModel ? <span className="text-muted-foreground"> · {item.brandModel}</span> : null}
                  {item.year ? <span className="text-muted-foreground"> · {item.year}</span> : null}
                </p>
                <p className="mt-1 flex flex-wrap justify-between gap-2">
                  <span>
                    {item.quantity} × <AmountText value={item.unitPrice} currency={order.currency} />
                  </span>
                  <AmountText value={item.lineTotal} currency={order.currency} className="font-medium" />
                </p>
                {item.supplier || item.hsCode ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.supplier ? (
                      <Link to={`/suppliers/${item.supplier.id}`} className="underline-offset-2 hover:underline">
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
  const tab = (ORDER_TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as OrderTab) : 'overview';
  const order = useOrder(id);
  const setStatus = useSetOrderStatus(id ?? '');
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
          <div className="min-w-48 flex-1">
            <label htmlFor="order-status" className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('orders.status')}
            </label>
            <Select
              id="order-status"
              value={o.status}
              disabled={setStatus.isPending}
              onChange={(e) => setStatus.mutate(e.target.value as OrderStatus)}
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`orderStatus.${status}`)}
                </option>
              ))}
            </Select>
          </div>
          <Link
            to={`/orders/${o.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            {t('orders.actions.edit')}
          </Link>
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
          <ConfirmDelete
            title={t('orders.delete.title')}
            body={t('orders.delete.body')}
            pending={remove.isPending}
            error={remove.error}
            onReset={() => remove.reset()}
            onConfirm={() => remove.mutate(o.id, { onSuccess: () => void navigate('/orders', { replace: true }) })}
          />
        </div>
        {setStatus.error ? <Alert tone="danger">{errorMessage(setStatus.error)}</Alert> : null}
        {duplicate.error ? <Alert tone="danger">{errorMessage(duplicate.error)}</Alert> : null}
      </header>

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

      <nav aria-label={t('orders.tabs.label')} className="-mx-4 overflow-x-auto px-4">
        <div role="tablist" className="flex min-w-max gap-1 border-b border-border">
          {ORDER_TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setParams(key === 'overview' ? {} : { tab: key }, { replace: true })}
              className={cn(
                'min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-medium',
                tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`orders.tabs.${key}`)}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel">
        {tab === 'overview' ? (
          <OrderOverview order={o} />
        ) : tab === 'notes' ? (
          <NotesTab orderId={o.id} />
        ) : (
          <ComingSoon title={t(`orders.tabs.${tab}`)} />
        )}
      </div>
    </div>
  );
}
