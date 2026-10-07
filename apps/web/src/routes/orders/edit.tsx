import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useOrder, useUpdateOrder } from '@/api/orders';
import { Alert } from '@/components/ui/alert';
import { draftFromOrder, OrderForm } from './OrderForm';

/** US2 / FR-013: edit every field and item line in one save. */
export function EditOrderPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const order = useOrder(id);
  const update = useUpdateOrder(id);

  if (order.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (order.error) return <Alert tone="danger">{errorMessage(order.error)}</Alert>;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground" dir="ltr">
          {order.data.number}
        </p>
        <h1 className="text-2xl font-semibold">{t('orders.editTitle')}</h1>
      </div>
      <OrderForm
        initial={draftFromOrder(order.data)}
        submitLabel={t('orders.form.save')}
        pending={update.isPending}
        error={update.error}
        onSubmit={(input) =>
          update.mutate({ ...input, status: order.data.status }, { onSuccess: () => void navigate(`/orders/${id}`, { replace: true }) })
        }
      />
    </div>
  );
}
