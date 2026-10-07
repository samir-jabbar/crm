import type { OrderStatus } from '@hanjing/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

const TONE: Record<OrderStatus, 'neutral' | 'primary' | 'success' | 'danger'> = {
  draft: 'neutral',
  confirmed: 'primary',
  purchased: 'primary',
  in_production: 'primary',
  inland_transport: 'primary',
  at_port: 'primary',
  on_vessel: 'primary',
  arrived: 'primary',
  customs_cleared: 'primary',
  delivered: 'success',
  closed: 'success',
  cancelled: 'danger',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Badge tone={TONE[status]}>{t(`orderStatus.${status}`)}</Badge>;
}
