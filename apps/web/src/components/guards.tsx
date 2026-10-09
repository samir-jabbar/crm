import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Module, PolicyAction } from '@hanjing/shared';
import { Link, Navigate, useLocation } from 'react-router';
import { useMe, useSetupStatus } from '@/api/queries';
import { useErrorMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { useAccess } from '@/lib/access';

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
  // 005 FR-037: an Owner-set temporary password must be replaced before anything else.
  if (me.data.user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
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

/** 005 FR-012: a screen the user may not use shows this, never data. */
export function AccessDenied() {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 py-8 text-center">
      <h1 className="text-xl font-semibold">{t('access.deniedTitle')}</h1>
      <p className="text-muted-foreground">{t('access.deniedBody')}</p>
      <Link to="/" className="inline-flex min-h-11 items-center text-primary underline-offset-2 hover:underline">
        {t('access.backHome')}
      </Link>
    </section>
  );
}

/** Shows the page only to users with `action` in `module` (005). `'orders'` + view also admits the basic order view. */
export function RequireModule({
  module,
  action = 'view',
  children,
}: {
  module: Module | 'payments';
  action?: PolicyAction;
  children: ReactNode;
}) {
  const access = useAccess();
  const allowed = module === 'orders' && action === 'view' ? access.reachesOrders : access.can(module, action);
  return allowed ? <>{children}</> : <AccessDenied />;
}

/** Shows the page to users with any of these modules (Settings opens to Settings or Exchange rates). */
export function RequireAny({ modules, children }: { modules: Module[]; children: ReactNode }) {
  const access = useAccess();
  return modules.some((m) => access.can(m)) ? <>{children}</> : <AccessDenied />;
}
