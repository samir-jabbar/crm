import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { useMe, useSetupStatus } from '@/api/queries';
import { useErrorMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';

export function FullPageStatus({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 text-center text-muted-foreground">
      <div>{children}</div>
    </main>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  return (
    <FullPageStatus>
      <p className="mb-4">{message(error)}</p>
      <Button onClick={onRetry}>{t('common.retry')}</Button>
    </FullPageStatus>
  );
}

/** Resolves setup status and the signed-in user once, then routes to setup / sign-in / the app. */
function useGate() {
  const setup = useSetupStatus();
  const me = useMe();
  return { setup, me, loading: setup.isPending || me.isPending, error: setup.error ?? me.error };
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { setup, me, loading, error } = useGate();
  const location = useLocation();
  if (loading) return <FullPageStatus>{t('common.loading')}</FullPageStatus>;
  if (error && !me.data) return <LoadError error={error} onRetry={() => void Promise.all([setup.refetch(), me.refetch()])} />;
  if (setup.data?.setupRequired) return <Navigate to="/setup" replace />;
  if (!me.data) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function OwnerOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data?.user.role !== 'owner') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Sign-in screen: only for signed-out users once setup is done. */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { setup, me, loading, error } = useGate();
  if (loading) return <FullPageStatus>{t('common.loading')}</FullPageStatus>;
  if (error) return <LoadError error={error} onRetry={() => void Promise.all([setup.refetch(), me.refetch()])} />;
  if (setup.data?.setupRequired) return <Navigate to="/setup" replace />;
  if (me.data) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Setup screen: only while no Owner exists. */
export function SetupOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const setup = useSetupStatus();
  if (setup.isPending) return <FullPageStatus>{t('common.loading')}</FullPageStatus>;
  if (setup.error) return <LoadError error={setup.error} onRetry={() => void setup.refetch()} />;
  if (!setup.data.setupRequired) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}
