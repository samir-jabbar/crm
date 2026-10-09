import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useDeleteExpense, useExpense, usePatchExpenseStatus } from '@/api/expenses';
import { AmountText } from '@/components/AmountText';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { CalendarDate, ExpenseStatusBadge } from '@/components/ExpenseBits';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/i18n/format';
import { useAccess } from '@/lib/access';
import { categoryLabel } from '@/lib/categories';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

/** US1/US4: one expense, its receipt, and who created and last changed it (FR-009). */
export function ExpenseDetailPage() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const expense = useExpense(id);
  const patchStatus = usePatchExpenseStatus();
  const remove = useDeleteExpense();
  const access = useAccess();
  const canEdit = access.can('expenses', 'edit');

  if (expense.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (expense.error) return <Alert tone="danger">{errorMessage(expense.error)}</Alert>;
  const e = expense.data;
  const receiptUrl = `/api/expenses/${e.id}/receipt`;
  const paidTo = e.paidTo ? ('supplier' in e.paidTo ? e.paidTo.supplier.name : e.paidTo.name) : null;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <Link to={`/orders/${e.orderId}?tab=expenses`} className="text-sm text-primary underline-offset-2 hover:underline">
          {t('expenses.backToOrder')}
        </Link>
        <h1 className="text-2xl font-semibold" dir="auto">
          {e.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <ExpenseStatusBadge status={e.status} />
          {e.advancedBy && e.reimbursed ? <Badge tone="success">{t('expenses.reimbursed')}</Badge> : null}
          <AmountText value={e.cnyAmount} currency="CNY" className="text-lg font-semibold" />
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
          <Button
            variant={e.status === 'to_pay' ? 'primary' : 'secondary'}
            disabled={patchStatus.isPending}
            onClick={() => patchStatus.mutate({ id: e.id, status: e.status === 'to_pay' ? 'paid' : 'to_pay' })}
          >
            {e.status === 'to_pay' ? t('expenses.actions.markPaid') : t('expenses.actions.markToPay')}
          </Button>
          ) : null}
          {canEdit && e.advancedBy ? (
            <Button
              variant="secondary"
              disabled={patchStatus.isPending}
              onClick={() => patchStatus.mutate({ id: e.id, reimbursed: !e.reimbursed })}
            >
              {e.reimbursed ? t('expenses.actions.markNotReimbursed') : t('expenses.actions.markReimbursed')}
            </Button>
          ) : null}
          {canEdit ? (
          <Link
            to={`/expenses/${e.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            {t('expenses.actions.edit')}
          </Link>
          ) : null}
          {access.can('expenses', 'delete') ? (
          <ConfirmDelete
            title={t('expenses.delete.title')}
            body={t('expenses.delete.body')}
            pending={remove.isPending}
            error={remove.error}
            onReset={() => remove.reset()}
            onConfirm={() =>
              remove.mutate(e.id, { onSuccess: () => void navigate(`/orders/${e.orderId}?tab=expenses`, { replace: true }) })
            }
          />
          ) : null}
        </div>
        {patchStatus.error ? <Alert tone="danger">{errorMessage(patchStatus.error)}</Alert> : null}
      </header>

      <Card>
        <dl className="divide-y divide-border text-sm">
          <Row label={t('expenses.form.category')}>
            <span dir="auto">{categoryLabel(e.category, t)}</span>
          </Row>
          <Row label={t('expenses.form.amount')}>
            <AmountText value={e.amount} currency={e.currency} />
          </Row>
          {e.currency !== 'CNY' ? (
            <Row label={t('expenses.form.rate')}>
              <bdi dir="ltr">
                1 {e.currency} = {e.rate} CNY
              </bdi>
              <span className="block text-xs text-muted-foreground">{t(`rateSource.${e.rateSource}`)}</span>
            </Row>
          ) : null}
          <Row label={t('expenses.form.date')}>
            <CalendarDate value={e.expenseDate} />
          </Row>
          {e.status === 'to_pay' && e.dueDate ? (
            <Row label={t('expenses.form.dueDate')}>
              <CalendarDate value={e.dueDate} />
            </Row>
          ) : null}
          <Row label={t('expenses.form.paidTo')}>
            {e.paidTo && 'supplier' in e.paidTo ? (
              <Link to={`/suppliers/${e.paidTo.supplier.id}`} className="text-primary underline-offset-2 hover:underline">
                <bdi>{paidTo}</bdi>
              </Link>
            ) : (
              <bdi>{paidTo ?? '—'}</bdi>
            )}
          </Row>
          <Row label={t('expenses.form.paymentMethod')}>{t(`paymentMethod.${e.paymentMethod}`)}</Row>
          <Row label={t('expenses.form.advancedBy')}>
            <bdi>{e.advancedBy ?? '—'}</bdi>
          </Row>
          {e.notes ? (
            <Row label={t('expenses.form.notes')}>
              <span className="whitespace-pre-line" dir="auto">
                {e.notes}
              </span>
            </Row>
          ) : null}
        </dl>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">{t('expenses.form.receipt')}</h2>
        {!e.hasReceipt ? (
          <p className="text-sm text-muted-foreground">{t('expenses.receipt.none')}</p>
        ) : e.receiptMime?.startsWith('image/') ? (
          <a href={receiptUrl} target="_blank" rel="noopener">
            <img src={receiptUrl} alt={t('expenses.receipt.preview')} className="max-h-96 w-full rounded-lg border border-border object-contain" />
          </a>
        ) : (
          <a
            href={receiptUrl}
            download
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            {t('expenses.receipt.openPdf')}
          </a>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {t('expenses.createdBy', { user: e.createdBy ?? '—', date: formatDateTime(e.createdAt, i18n.language) })}
        <br />
        {t('expenses.updatedBy', { user: e.updatedBy ?? '—', date: formatDateTime(e.updatedAt, i18n.language) })}
      </p>
    </div>
  );
}
