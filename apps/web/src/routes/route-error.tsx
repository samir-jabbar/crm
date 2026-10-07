import { useTranslation } from 'react-i18next';
import { FullPageStatus } from '@/components/guards';
import { Button } from '@/components/ui/button';

export function RouteError() {
  const { t } = useTranslation();
  return (
    <FullPageStatus>
      <p className="mb-4">{t('errors.internal_error')}</p>
      <Button onClick={() => window.location.assign('/')}>{t('common.retry')}</Button>
    </FullPageStatus>
  );
}
