import { OPEN_ORDER_STATUSES } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useOrdersSummary } from '@/api/orders';
import { useMe } from '@/api/queries';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { useAccess } from '@/lib/access';
import { ToReimburseBlock } from '@/routes/reimbursements';

/** Open orders by status (FR-026), each linking to the filtered order list. */
function OpenOrders() {
  const { t } = useTranslation();
  const summary = useOrdersSummary();
  if (!summary.data) return null;
  const { openByStatus, openTotal } = summary.data;
  return (
    <Card>
      <CardTitle>{t('dashboard.openOrders', { count: openTotal })}</CardTitle>
      {openTotal === 0 ? (
        <CardDescription className="mt-1">{t('dashboard.noOpenOrders')}</CardDescription>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {OPEN_ORDER_STATUSES.filter((s) => openByStatus[s]).map((status) => (
            <li key={status}>
              <Link
                to={`/orders?status=${status}`}
                className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-muted px-3 text-sm hover:bg-primary/10"
              >
                <span>{t(`orderStatus.${status}`)}</span>
                <span className="font-semibold">{openByStatus[status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** FR-034 (001) + FR-026 (002): welcome, company, open orders, and links. */
export function DashboardPage() {
  const { t } = useTranslation();
  const me = useMe();
  const access = useAccess();
  if (!me.data) return null;
  const { user, company } = me.data;
  const isOwner = user.role === 'owner';

  // 005 FR-012: only what the user may use.
  const card = (key: string, to: string, shown: boolean) =>
    shown ? [{ to, title: t(`dashboard.cards.${key}.title`), description: t(`dashboard.cards.${key}.description`) }] : [];
  const cards = [
    ...card('orders', '/orders', access.reachesOrders),
    ...card('customers', '/customers', access.can('customers')),
    ...card('suppliers', '/suppliers', access.can('suppliers')),
    ...card('security', '/security', true),
    ...card('settings', '/settings', access.can('settings') || access.can('rates')),
    ...card('audit', '/audit', isOwner),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t('dashboard.welcome')} <bdi>{user.displayName}</bdi>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {company.name.trim() ? <bdi>{company.name}</bdi> : t('dashboard.noCompany')}
        </p>
      </div>
      {access.can('orders') ? <OpenOrders /> : null}
      {access.can('dashboard') && access.can('expenses') ? <ToReimburseBlock /> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.to}>
            <Link to={card.to} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
              <Card className="min-h-24 transition-colors hover:border-primary/50">
                <CardTitle>{card.title}</CardTitle>
                <CardDescription className="mt-1">{card.description}</CardDescription>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
