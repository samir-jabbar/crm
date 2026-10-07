import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';

/** Placeholder for order-page tabs whose feature is not built yet (FR-015). */
export function ComingSoon({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Card className="text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('comingSoon.body')}</p>
    </Card>
  );
}
