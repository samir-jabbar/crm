import type { UserListItem } from '@hanjing/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useRejectUser, useUsers } from '@/api/users';
import { ConfirmAction } from '@/components/ConfirmAction';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/i18n/format';
import { STATUS_TONE, templateName, userStatusKey } from '@/lib/workers';

function PendingCard({ user }: { user: UserListItem }) {
  const { t, i18n } = useTranslation();
  const reject = useRejectUser(user.id);
  const reg = user.registration;
  return (
    <Card className="space-y-3 text-sm" aria-label={user.displayName}>
      <div>
        <p className="text-base font-semibold" dir="auto">
          {user.displayName}
        </p>
        <p className="text-muted-foreground">
          <bdi dir="ltr">{user.username}</bdi> · {t(`language.${user.language}`)}
        </p>
      </div>
      <dl className="space-y-1">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">{t('users.registeredAt')}</dt>
          <dd>{formatDateTime(reg?.at ?? user.registeredAt, i18n.language)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">{t('users.device')}</dt>
          <dd dir="auto">{reg?.deviceLabel ?? t('common.unknown')}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">{t('users.location')}</dt>
          <dd dir="auto">{reg?.location ?? t('security.locationUnknown')}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/users/${user.id}/approve`}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          aria-label={t('users.approveName', { name: user.displayName })}
        >
          {t('users.approve')}
        </Link>
        <ConfirmAction
          label={t('users.reject')}
          title={t('users.rejectTitle', { name: user.displayName })}
          body={t('users.rejectBody')}
          confirmLabel={t('users.reject')}
          danger
          pending={reject.isPending}
          error={reject.error}
          onConfirm={() => reject.mutate()}
        />
      </div>
    </Card>
  );
}

function UserRow({ user }: { user: UserListItem }) {
  const { t, i18n } = useTranslation();
  const status = userStatusKey(user);
  return (
    <li>
      <Link to={`/users/${user.id}`} className="block rounded-xl border border-border bg-surface p-4 hover:bg-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold" dir="auto">
            {user.displayName}
          </span>
          <Badge tone={STATUS_TONE[status]}>{t(`workers.status.${status}`)}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <bdi dir="ltr">{user.username}</bdi>
          {user.template ? (
            <>
              {' · '}
              {templateName(user.template, t)}
              {user.adjusted ? ` (${t('users.adjusted')})` : ''}
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {user.lastSignInAt ? t('users.lastSignIn', { date: formatDateTime(user.lastSignInAt, i18n.language) }) : t('users.neverSignedIn')}
        </p>
      </Link>
    </li>
  );
}

/** 005 FR-003, FR-034: registrations waiting for approval, then every worker account. Owner only. */
export function UsersPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const deletedId = useId();
  const [showDeleted, setShowDeleted] = useState(false);
  const users = useUsers();
  const deleted = useUsers({ deleted: true }, showDeleted);
  const pending = users.data?.items.filter((u) => u.status === 'pending') ?? [];
  const others = users.data?.items.filter((u) => u.status !== 'pending') ?? [];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('users.title')}</h1>
        <Link to="/users/templates" className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-2 hover:underline">
          {t('users.templatesLink')}
        </Link>
      </div>
      {users.error ? <Alert tone="danger">{errorMessage(users.error)}</Alert> : null}
      {users.isPending ? <p className="text-muted-foreground">{t('common.loading')}</p> : null}

      {pending.length > 0 ? (
        <section className="space-y-3" aria-label={t('users.pendingTitle')}>
          <h2 className="text-base font-semibold">{t('users.pendingTitle')}</h2>
          {pending.map((u) => (
            <PendingCard key={u.id} user={u} />
          ))}
        </section>
      ) : null}

      <section className="space-y-3" aria-label={t('users.workersTitle')}>
        <h2 className="text-base font-semibold">{t('users.workersTitle')}</h2>
        {users.data && others.length === 0 ? <p className="text-sm text-muted-foreground">{t('users.empty')}</p> : null}
        <ul className="space-y-2">
          {others.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </ul>
      </section>

      <label htmlFor={deletedId} className="flex min-h-11 items-center gap-2 text-sm">
        <input id={deletedId} type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="size-5" />
        {t('users.showDeleted')}
      </label>
      {showDeleted ? (
        <ul className="space-y-2" aria-label={t('users.deletedTitle')}>
          {(deleted.data?.items ?? []).map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
