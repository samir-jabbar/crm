import type { Expense, ExpenseTotals } from '@hanjing/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useOrderExpenses, useRestoreExpense } from '@/api/expenses';
import { useAccess } from '@/lib/access';
import { AmountText } from '@/components/AmountText';
import { CalendarDate, ExpenseStatusBadge, ReceiptMarker } from '@/components/ExpenseBits';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { categoryLabel } from '@/lib/categories';

function TotalsCard({ totals, yourEntries }: { totals: ExpenseTotals; yourEntries?: boolean }) {
  const { t } = useTranslation();
  return (
    <Card className="space-y-3 text-sm">
      {/* 005 FR-028: a worker who sees only their own entries sees totals of those entries, labelled so. */}
      {yourEntries ? <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('access.yourEntries')}</p> : null}
      <div className="flex flex-wrap justify-between gap-2">
        <span className="font-medium">{t('expenses.totals.grand')}</span>
        <AmountText value={totals.grand} currency="CNY" className="text-base font-semibold" />
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <span className="text-muted-foreground">{t('expenses.totals.unpaid')}</span>
        <AmountText value={totals.unpaid} currency="CNY" />
      </div>
      {totals.byCategory.length > 0 ? (
        <section aria-label={t('expenses.totals.byCategory')}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('expenses.totals.byCategory')}</h3>
          <ul className="divide-y divide-border">
            {totals.byCategory.map(({ category, total }) => (
              <li key={category.id} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0" dir="auto">
                  {categoryLabel(category, t)}
                </span>
                <AmountText value={total} currency="CNY" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {totals.byAdvancedBy && totals.byAdvancedBy.length > 0 ? (
        <section aria-label={t('expenses.totals.byPerson')}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('expenses.totals.byPerson')}</h3>
          <ul className="divide-y divide-border">
            {totals.byAdvancedBy.map((person) => (
              <li key={person.name} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                <span className="min-w-0" dir="auto">
                  {person.name}
                </span>
                <span className="text-end">
                  <AmountText value={person.total} currency="CNY" />
                  {person.toReimburse !== '0.00' ? (
                    <span className="block text-xs text-warning">
                      {t('expenses.totals.toReimburse')} <AmountText value={person.toReimburse} currency="CNY" />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const { t } = useTranslation();
  return (
    <Link to={`/expenses/${expense.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
      <Card className="space-y-1 text-sm hover:bg-muted/50">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-medium" dir="auto">
            {expense.name}
          </p>
          <AmountText value={expense.cnyAmount} currency="CNY" className="font-semibold" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0">
            <span dir="auto">{categoryLabel(expense.category, t)}</span> · <CalendarDate value={expense.expenseDate} />
          </span>
          {expense.currency !== 'CNY' ? <AmountText value={expense.amount} currency={expense.currency} /> : null}
        </div>
        <div className="flex items-center gap-2">
          <ExpenseStatusBadge status={expense.status} />
          {expense.hasReceipt ? <ReceiptMarker /> : null}
        </div>
      </Card>
    </Link>
  );
}

/** FR-008: deleted expenses, each with "Restore". They are not links: a deleted expense has no page. */
function DeletedExpenses({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const deleted = useOrderExpenses(orderId, { deleted: true });
  const restore = useRestoreExpense();
  if (deleted.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (deleted.error) return <Alert tone="danger">{errorMessage(deleted.error)}</Alert>;
  if (deleted.data.items.length === 0) return <p className="text-sm text-muted-foreground">{t('expenses.noDeleted')}</p>;
  return (
    <ul className="space-y-2" aria-label={t('expenses.deletedTitle')}>
      {deleted.data.items.map((expense) => (
        <li key={expense.id}>
          <Card className="flex flex-wrap items-center justify-between gap-3 text-sm opacity-80">
            <span className="min-w-0">
              <span className="block font-medium" dir="auto">
                {expense.name}
              </span>
              <span className="text-xs text-muted-foreground">
                <CalendarDate value={expense.expenseDate} /> · <AmountText value={expense.cnyAmount} currency="CNY" />
              </span>
            </span>
            <Button variant="secondary" disabled={restore.isPending} onClick={() => restore.mutate(expense.id)}>
              {t('expenses.actions.restore')}
            </Button>
          </Card>
        </li>
      ))}
      {restore.error ? <Alert tone="danger">{errorMessage(restore.error)}</Alert> : null}
    </ul>
  );
}

/** FR-010: the order's expenses, newest first, with totals in CNY. */
export function ExpensesTab({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const expenses = useOrderExpenses(orderId);
  const [showDeleted, setShowDeleted] = useState(false);
  const deletedToggleId = useId();
  const access = useAccess();

  return (
    <div className="space-y-4">
      {access.can('expenses', 'create') ? (
        <Link
          to={`/orders/${orderId}/expenses/new`}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('expenses.add')}
        </Link>
      ) : null}
      {expenses.isPending ? <p className="text-muted-foreground">{t('common.loading')}</p> : null}
      {expenses.error ? <Alert tone="danger">{errorMessage(expenses.error)}</Alert> : null}
      {expenses.data ? (
        <>
          <TotalsCard totals={expenses.data.totals} yourEntries={expenses.data.yourEntries} />
          {expenses.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('expenses.empty')}</p>
          ) : (
            <ul className="space-y-2" aria-label={t('orders.tabs.expenses')}>
              {expenses.data.items.map((expense) => (
                <li key={expense.id}>
                  <ExpenseRow expense={expense} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {access.can('expenses', 'delete') ? (
        <label htmlFor={deletedToggleId} className="flex min-h-11 items-center gap-2 text-sm">
          <input id={deletedToggleId} type="checkbox" className="size-5" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          {t('expenses.showDeleted')}
        </label>
      ) : null}
      {showDeleted ? <DeletedExpenses orderId={orderId} /> : null}
    </div>
  );
}
