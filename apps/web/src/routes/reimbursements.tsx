import { useTranslation } from 'react-i18next';
import { useAccess } from '@/lib/access';
import { Link, useSearchParams } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { usePatchExpenseStatus, useReimbursements, useToReimburse } from '@/api/expenses';
import { AmountText } from '@/components/AmountText';
import { CalendarDate } from '@/components/ExpenseBits';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';

/** Dashboard block (003 FR-020): what is owed to whom, across all orders. Hidden when nothing is owed. */
export function ToReimburseBlock() {
  const { t } = useTranslation();
  const owed = useReimbursements();
  const { partialView } = useAccess();
  if (!owed.data || owed.data.length === 0) return null;
  return (
    <Card>
      <CardTitle>{t('reimbursements.title')}</CardTitle>
      <CardDescription className="mt-1">{t('reimbursements.description')}</CardDescription>
      {partialView ? <p className="mt-1 text-xs text-muted-foreground">{t('reimbursements.partial')}</p> : null}
      <ul className="mt-3 divide-y divide-border">
        {owed.data.map((person) => (
          <li key={person.name}>
            <Link
              to={`/reimbursements?person=${encodeURIComponent(person.name)}`}
              className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:text-primary"
            >
              <span className="min-w-0" dir="auto">
                {person.name}
                <span className="ms-2 text-xs text-muted-foreground">{t('reimbursements.expenseCount', { count: person.expenseCount })}</span>
              </span>
              <AmountText value={person.toReimburse} currency="CNY" className="font-semibold" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** One person's open advances, each linking to its expense, with "Mark reimbursed" (FR-019, FR-020). */
export function ReimbursementsPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [params] = useSearchParams();
  const person = params.get('person') ?? '';
  const open = useToReimburse(person);
  const patch = usePatchExpenseStatus();

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-primary underline-offset-2 hover:underline">
        {t('reimbursements.back')}
      </Link>
      <h1 className="text-2xl font-semibold">
        {t('reimbursements.personTitle')} <bdi>{open.data?.person ?? person}</bdi>
      </h1>
      {open.isPending && person ? <p className="text-muted-foreground">{t('common.loading')}</p> : null}
      {open.error ? <Alert tone="danger">{errorMessage(open.error)}</Alert> : null}
      {patch.error ? <Alert tone="danger">{errorMessage(patch.error)}</Alert> : null}
      {open.data ? (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t('reimbursements.stillOwed')}</span>
            <AmountText value={open.data.total} currency="CNY" className="text-lg font-semibold" />
          </Card>
          {open.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reimbursements.nothingOwed')}</p>
          ) : (
            <ul className="space-y-2" aria-label={t('reimbursements.listLabel')}>
              {open.data.items.map((expense) => (
                <li key={expense.id}>
                  <Card className="space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/expenses/${expense.id}`} className="min-w-0 font-medium text-primary underline-offset-2 hover:underline">
                        <bdi>{expense.name}</bdi>
                      </Link>
                      <AmountText value={expense.cnyAmount} currency="CNY" className="font-semibold" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <bdi dir="ltr">{expense.order.number}</bdi> · <bdi>{expense.order.title}</bdi> · <CalendarDate value={expense.expenseDate} />
                    </p>
                    <Button variant="secondary" disabled={patch.isPending} onClick={() => patch.mutate({ id: expense.id, reimbursed: true })}>
                      {t('expenses.actions.markReimbursed')}
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
