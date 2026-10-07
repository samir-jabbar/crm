import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { useCustomer } from '@/api/addressBook';
import { useCreateOrder } from '@/api/orders';
import { emptyOrderDraft, OrderForm } from './OrderForm';

/** US1: create an order. `?customerId=` preselects the customer (from a customer page). */
export function NewOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const customerId = params.get('customerId') ?? undefined;
  const customer = useCustomer(customerId);
  const create = useCreateOrder();

  if (customerId && customer.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  const preselected = customer.data ? { id: customer.data.id, name: customer.data.name, city: customer.data.city } : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('orders.newTitle')}</h1>
      <OrderForm
        initial={emptyOrderDraft(preselected)}
        submitLabel={t('orders.form.create')}
        pending={create.isPending}
        error={create.error}
        onSubmit={(input) => create.mutate(input, { onSuccess: (order) => void navigate(`/orders/${order.id}`, { replace: true }) })}
      />
    </div>
  );
}
