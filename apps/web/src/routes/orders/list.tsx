import { ORDER_STATUSES, type OrderStatus } from '@hanjing/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useOrders, useRestoreOrder, type OrderFilters } from '@/api/orders';
import { CustomerPicker, type PickedEntity } from '@/components/AddressPicker';
import { AmountText } from '@/components/AmountText';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/i18n/format';
import { useDebounced } from '@/lib/useDebounced';
import { cn } from '@/lib/utils';

function statusesFromUrl(value: string | null): OrderStatus[] {
  if (!value) return [];
  return value.split(',').filter((s): s is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(s));
}

/** US2 / FR-014: newest first, search in any script, filters, load more. */
export function OrdersListPage() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const [params] = useSearchParams();
  const [text, setText] = useState('');
  const q = useDebounced(text);
  const [statuses, setStatuses] = useState<OrderStatus[]>(() => statusesFromUrl(params.get('status')));
  const [customer, setCustomer] = useState<PickedEntity | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(statuses.length > 0);

  const filters: OrderFilters = {
    q,
    status: statuses,
    customerId: customer?.id,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    deleted,
  };
  const orders = useOrders(filters);
  const restore = useRestoreOrder();
  const items = orders.data?.pages.flatMap((p) => p.items) ?? [];
  const activeFilters = statuses.length + (customer ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  const clear = () => {
    setStatuses([]);
    setCustomer(null);
    setFrom('');
    setTo('');
  };
  const toggleStatus = (status: OrderStatus) =>
    setStatuses((list) => (list.includes(status) ? list.filter((s) => s !== status) : [...list, status]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{deleted ? t('orders.deletedTitle') : t('nav.orders')}</h1>
        <Link
          to="/orders/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t('orders.newTitle')}
        </Link>
      </div>

      <Input
        type="search"
        aria-label={t('orders.list.search')}
        placeholder={t('orders.list.searchPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        dir="auto"
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
          {t('orders.list.filters')}
          {activeFilters > 0 ? ` (${activeFilters})` : ''}
        </Button>
        {activeFilters > 0 ? (
          <Button variant="ghost" onClick={clear}>
            {t('orders.list.clearFilters')}
          </Button>
        ) : null}
      </div>

      {filtersOpen ? (
        <Card className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('orders.list.status')}</legend>
            <div className="flex flex-wrap gap-2">
              {ORDER_STATUSES.map((status) => {
                const checked = statuses.includes(status);
                return (
                  <label
                    key={status}
                    className={cn(
                      'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm',
                      checked ? 'border-primary bg-primary/10 text-primary' : 'border-border',
                    )}
                  >
                    <input type="checkbox" className="size-4" checked={checked} onChange={() => toggleStatus(status)} />
                    {t(`orderStatus.${status}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <CustomerPicker label={t('orders.form.customer')} value={customer} onSelect={setCustomer} allowCreate={false} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="orders-from">{t('orders.list.from')}</Label>
              <Input id="orders-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} />
            </div>
            <div>
              <Label htmlFor="orders-to">{t('orders.list.to')}</Label>
              <Input id="orders-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} />
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={deleted} onChange={(e) => setDeleted(e.target.checked)} />
            {t('orders.list.showDeleted')}
          </label>
        </Card>
      ) : null}

      {orders.error ? <Alert tone="danger">{errorMessage(orders.error)}</Alert> : null}
      {restore.error ? <Alert tone="danger">{errorMessage(restore.error)}</Alert> : null}
      {orders.isPending ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {orders.data && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{q || activeFilters ? t('orders.list.noMatch') : t('orders.list.empty')}</p>
      ) : null}

      <ul className="space-y-3">
        {items.map((order) => {
          const card = (
            <Card className="space-y-1.5 transition-colors hover:border-primary/50">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span dir="ltr">{order.number}</span>
                <time dateTime={order.createdAt}>{formatDateTime(order.createdAt, i18n.language, { dateStyle: 'medium' })}</time>
              </div>
              <p className="font-semibold" dir="auto">
                {order.title}
              </p>
              <p className="text-sm text-muted-foreground" dir="auto">
                {order.customer.name}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={order.status} />
                <AmountText value={order.agreedPrice} currency={order.currency} className="font-medium" />
              </div>
            </Card>
          );
          return (
            <li key={order.id}>
              {deleted ? (
                <div className="space-y-2">
                  {card}
                  <Button variant="secondary" onClick={() => restore.mutate(order.id)} disabled={restore.isPending}>
                    {t('addressBook.restore')}
                  </Button>
                </div>
              ) : (
                <Link to={`/orders/${order.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
                  {card}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {orders.hasNextPage ? (
        <Button variant="secondary" onClick={() => void orders.fetchNextPage()} disabled={orders.isFetchingNextPage}>
          {t('common.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
