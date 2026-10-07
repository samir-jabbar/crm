import {
  passwordSchema,
  type ChangePasswordRequest,
  type Page,
  type SessionListResponse,
  type SignInHistoryItem,
} from '@hanjing/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { api, ApiError } from '@/api/http';
import { queryKeys } from '@/api/queries';
import { PasswordField } from '@/components/Field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { formatDateTime } from '@/i18n/format';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <Card>
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </Card>
    </section>
  );
}

function ChangePassword() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [localError, setLocalError] = useState<{ field: 'newPassword' | 'confirm'; message: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (body: ChangePasswordRequest) => api<void>('POST', '/api/me/password', body),
    onSuccess: () => {
      setValues({ currentPassword: '', newPassword: '', confirm: '' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.signInHistory });
    },
  });

  const server = fieldErrors(mutation.error);
  const currentError =
    mutation.error instanceof ApiError && mutation.error.code === 'current_password_invalid'
      ? t('errors.current_password_invalid')
      : null;
  const newError =
    localError?.field === 'newPassword'
      ? localError.message
      : server.newPassword
        ? t(`errors.${server.newPassword}`)
        : null;
  const otherError =
    mutation.error &&
    !(mutation.error instanceof ApiError && ['validation_failed', 'current_password_invalid'].includes(mutation.error.code))
      ? errorMessage(mutation.error)
      : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.reset();
    const parsed = passwordSchema.safeParse(values.newPassword);
    if (!parsed.success) {
      setLocalError({ field: 'newPassword', message: t(`errors.${parsed.error.issues[0]?.message ?? 'invalid_value'}`) });
      return;
    }
    if (values.newPassword !== values.confirm) {
      setLocalError({ field: 'confirm', message: t('security.password.mismatch') });
      return;
    }
    setLocalError(null);
    mutation.mutate({ currentPassword: values.currentPassword, newPassword: values.newPassword });
  }

  const set = (name: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  return (
    <Section title={t('security.password.title')} description={t('security.password.hint')}>
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <PasswordField
          label={t('security.password.current')}
          value={values.currentPassword}
          onChange={set('currentPassword')}
          error={currentError}
          autoComplete="current-password"
        />
        <PasswordField
          label={t('security.password.new')}
          value={values.newPassword}
          onChange={set('newPassword')}
          error={newError}
          autoComplete="new-password"
        />
        <PasswordField
          label={t('security.password.confirm')}
          value={values.confirm}
          onChange={set('confirm')}
          error={localError?.field === 'confirm' ? localError.message : null}
          autoComplete="new-password"
        />
        {otherError ? <Alert tone="danger">{otherError}</Alert> : null}
        {mutation.isSuccess ? <Alert tone="success">{t('security.password.success')}</Alert> : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t('security.password.submitting') : t('security.password.submit')}
        </Button>
      </form>
    </Section>
  );
}

function Devices() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api<SessionListResponse>('GET', '/api/me/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/api/me/sessions/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });

  const revokeAll = useMutation({
    mutationFn: () => api<void>('POST', '/api/me/sessions/revoke-all'),
    onSuccess: async () => {
      queryClient.setQueryData(queryKeys.me, null);
      await navigate('/sign-in', { replace: true });
    },
  });

  return (
    <Section title={t('security.sessions.title')} description={t('security.sessions.description')}>
      {sessions.isPending ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {sessions.error ? <Alert tone="danger">{errorMessage(sessions.error)}</Alert> : null}
      {sessions.data ? (
        <ul className="divide-y divide-border">
          {sessions.data.items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <bdi>{s.deviceLabel}</bdi>
                  {s.current ? <Badge tone="primary">{t('security.sessions.thisDevice')}</Badge> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  <bdi>{s.location ?? t('security.locationUnknown')}</bdi> · <bdi dir="ltr">{s.ip}</bdi>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('security.sessions.signedIn', { date: formatDateTime(s.createdAt, i18n.language) })} ·{' '}
                  {t('security.sessions.lastActive', { date: formatDateTime(s.lastActiveAt, i18n.language) })}
                </p>
              </div>
              {!s.current ? (
                <Button variant="secondary" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>
                  {t('security.sessions.signOut')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {revoke.error ? <Alert tone="danger">{errorMessage(revoke.error)}</Alert> : null}

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="danger" className="mt-4 w-full sm:w-auto">
            {t('security.sessions.signOutAll')}
          </Button>
        </DialogTrigger>
        <DialogContent title={t('security.sessions.confirmTitle')} description={t('security.sessions.confirmBody')}>
          {revokeAll.error ? <Alert tone="danger">{errorMessage(revokeAll.error)}</Alert> : null}
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </DialogClose>
            <Button variant="danger" onClick={() => revokeAll.mutate()} disabled={revokeAll.isPending}>
              {t('security.sessions.signOutAll')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

const OUTCOME_TONE = { success: 'success', failure: 'danger', blocked: 'warning' } as const;

function SignInHistory() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const history = useInfiniteQuery({
    queryKey: queryKeys.signInHistory,
    queryFn: ({ pageParam }) =>
      api<Page<SignInHistoryItem>>(
        'GET',
        `/api/me/sign-in-history?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Section title={t('security.history.title')}>
      {history.isPending ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {history.error ? <Alert tone="danger">{errorMessage(history.error)}</Alert> : null}
      {history.data && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('security.history.empty')}</p>
      ) : null}
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-3">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={OUTCOME_TONE[item.outcome]}>{t(`security.history.outcome.${item.outcome}`)}</Badge>
              <span className="text-sm">{formatDateTime(item.occurredAt, i18n.language)}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t(`security.history.reason.${item.reason}`)}</p>
            <p className="text-xs text-muted-foreground">
              <bdi>{item.deviceLabel}</bdi> · <bdi>{item.location ?? t('security.locationUnknown')}</bdi> ·{' '}
              <bdi dir="ltr">{item.ip}</bdi>
            </p>
          </li>
        ))}
      </ul>
      {history.hasNextPage ? (
        <Button variant="secondary" className="mt-3" onClick={() => void history.fetchNextPage()} disabled={history.isFetchingNextPage}>
          {t('common.loadMore')}
        </Button>
      ) : null}
    </Section>
  );
}

/** US3: password, signed-in devices and sign-in history. */
export function SecurityPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t('security.title')}</h1>
      <ChangePassword />
      <Devices />
      <SignInHistory />
      <p className="text-center text-xs text-muted-foreground">{t('security.geoAttribution')}</p>
    </div>
  );
}
