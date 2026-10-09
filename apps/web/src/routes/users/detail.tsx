import { LANGUAGES, type Language, type PermissionSet, type UserDetail } from '@hanjing/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { useOrders } from '@/api/orders';
import {
  useApplyTemplate,
  useDeleteUser,
  useReactivateUser,
  useResetUserPassword,
  useSetUserAccess,
  useSetUserOrders,
  useSignOutEverywhere,
  useSuspendUser,
  useTemplates,
  useUpdateUser,
  useUser,
  useUserSessions,
  useUserSignInHistory,
} from '@/api/users';
import { ConfirmAction } from '@/components/ConfirmAction';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/i18n/format';
import { STATUS_TONE, templateName, userStatusKey } from '@/lib/workers';
import { PermissionEditor } from './PermissionEditor';
import { ScopeEditor, type ScopeDraft } from './ScopeEditor';

interface Draft {
  permissions: PermissionSet;
  scope: ScopeDraft;
}

const draftOf = (u: UserDetail): Draft => ({
  permissions: u.permissions,
  scope: { orderScope: u.orderScope, customers: u.customers, ownEntriesOnly: u.ownEntriesOnly, accessEndsOn: u.accessEndsOn ?? '' },
});

/** 005 FR-007 – FR-023, FR-017: a worker's modules, hidden values and scope, saved together. */
/** FR-019: the orders assigned to this worker, for the "assigned orders" scope. */
function AssignedOrders({ user }: { user: UserDetail }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const searchId = useId();
  const [q, setQ] = useState('');
  const search = useOrders({ q });
  const save = useSetUserOrders(user.id);
  const assigned = user.assignedOrders;
  const results = q.trim() ? (search.data?.pages[0]?.items ?? []).filter((o) => !assigned.some((a) => a.id === o.id)).slice(0, 5) : [];
  const set = (ids: string[]) => save.mutate(ids, { onSuccess: () => setQ('') });

  return (
    <Card className="space-y-3 text-sm" aria-label={t('users.assigned.title')}>
      <h2 className="text-lg font-semibold">{t('users.assigned.title')}</h2>
      {user.orderScope !== 'assigned' ? <p className="text-muted-foreground">{t('users.assigned.notUsed')}</p> : null}
      {assigned.length === 0 ? <p className="text-muted-foreground">{t('users.assigned.none')}</p> : null}
      <ul className="divide-y divide-border">
        {assigned.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link to={`/orders/${o.id}`} className="min-w-0 hover:text-primary">
              <span className="block text-xs text-muted-foreground" dir="ltr">
                {o.number}
              </span>
              <span dir="auto">{o.title}</span>
            </Link>
            <Button
              variant="ghost"
              disabled={save.isPending}
              aria-label={t('users.assigned.remove', { number: o.number })}
              onClick={() => set(assigned.filter((a) => a.id !== o.id).map((a) => a.id))}
            >
              {t('users.assigned.removeShort')}
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Label htmlFor={searchId}>{t('users.assigned.add')}</Label>
        <Input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('orders.list.searchPlaceholder')} dir="auto" />
      </div>
      <ul className="space-y-1">
        {results.map((o) => (
          <li key={o.id}>
            <Button variant="secondary" className="w-full justify-start" disabled={save.isPending} onClick={() => set([...assigned.map((a) => a.id), o.id])}>
              <bdi dir="ltr">{o.number}</bdi>&nbsp;·&nbsp;<bdi>{o.title}</bdi>
            </Button>
          </li>
        ))}
      </ul>
      {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
    </Card>
  );
}

function AccessCard({ user }: { user: UserDetail }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [draft, setDraft] = useState<Draft>(() => draftOf(user));
  const save = useSetUserAccess(user.id);
  const apply = useApplyTemplate(user.id);
  const templates = useTemplates();
  const [templateId, setTemplateId] = useState('');

  return (
    <Card className="space-y-5" aria-label={t('users.access')}>
      <h2 className="text-lg font-semibold">{t('users.access')}</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label htmlFor="apply-template">{t('users.applyTemplate')}</Label>
          <Select id="apply-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">—</option>
            {templates.data?.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {templateName(tpl, t)}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          disabled={!templateId || apply.isPending}
          onClick={() => apply.mutate(templateId, { onSuccess: (updated) => setDraft(draftOf(updated)) })}
        >
          {t('users.apply')}
        </Button>
      </div>
      {apply.error ? <Alert tone="danger">{errorMessage(apply.error)}</Alert> : null}

      <PermissionEditor value={draft.permissions} onChange={(permissions) => setDraft((d) => ({ ...d, permissions }))} />
      <ScopeEditor value={draft.scope} onChange={(scope) => setDraft((d) => ({ ...d, scope }))} />

      {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">{t('users.accessSaved')}</Alert> : null}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <Button
          size="lg"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              permissions: draft.permissions,
              orderScope: draft.scope.orderScope,
              customerIds: draft.scope.customers.map((c) => c.id),
              ownEntriesOnly: draft.scope.ownEntriesOnly,
              accessEndsOn: draft.scope.accessEndsOn || null,
            })
          }
        >
          {save.isPending ? t('common.saving') : t('users.saveAccess')}
        </Button>
      </div>
    </Card>
  );
}

/** 005 FR-035 – FR-039: the account itself. Every action ends sessions where it should, and is audited. */
function AccountCard({ user }: { user: UserDetail }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const nameId = useId();
  const languageId = useId();
  const passwordId = useId();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [language, setLanguage] = useState<Language>(user.language);
  const [temporary, setTemporary] = useState('');
  const update = useUpdateUser(user.id);
  const suspend = useSuspendUser(user.id);
  const reactivate = useReactivateUser(user.id);
  const reset = useResetUserPassword(user.id);
  const signOut = useSignOutEverywhere(user.id);
  const remove = useDeleteUser(user.id);
  const sessions = useUserSessions(user.id);
  const history = useUserSignInHistory(user.id);
  const passwordError = fieldErrors(reset.error).temporaryPassword;

  return (
    <Card className="space-y-5 text-sm" aria-label={t('users.account.title')}>
      <h2 className="text-lg font-semibold">{t('users.account.title')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={nameId}>{t('setup.displayName')}</Label>
          <Input id={nameId} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} dir="auto" />
        </div>
        <div>
          <Label htmlFor={languageId}>{t('setup.language')}</Label>
          <Select id={languageId} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {LANGUAGES.map((lng) => (
              <option key={lng} value={lng}>
                {t(`language.${lng}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ displayName: displayName.trim(), language })}>
        {t('common.save')}
      </Button>
      {update.error ? <Alert tone="danger">{errorMessage(update.error)}</Alert> : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {user.status === 'suspended' ? (
          <Button disabled={reactivate.isPending} onClick={() => reactivate.mutate(undefined)}>
            {t('users.account.reactivate')}
          </Button>
        ) : (
          <ConfirmAction
            label={t('users.account.suspend')}
            title={t('users.account.suspendTitle', { name: user.displayName })}
            body={t('users.account.suspendBody')}
            confirmLabel={t('users.account.suspend')}
            pending={suspend.isPending}
            error={suspend.error}
            onConfirm={() => suspend.mutate(undefined)}
          />
        )}
        <ConfirmAction
          label={t('users.account.signOut')}
          title={t('users.account.signOutTitle', { name: user.displayName })}
          body={t('users.account.signOutBody')}
          confirmLabel={t('users.account.signOut')}
          pending={signOut.isPending}
          error={signOut.error}
          onConfirm={() => signOut.mutate(undefined)}
        />
        <ConfirmAction
          label={t('users.account.delete')}
          title={t('users.account.deleteTitle', { name: user.displayName })}
          body={t('users.account.deleteBody')}
          confirmLabel={t('users.account.delete')}
          danger
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate('/users', { replace: true }) })}
        />
      </div>
      {suspend.isSuccess || reactivate.isSuccess || signOut.isSuccess ? <Alert tone="success">{t('users.account.done')}</Alert> : null}
      {reactivate.error ? <Alert tone="danger">{errorMessage(reactivate.error)}</Alert> : null}

      <div className="space-y-2 border-t border-border pt-4">
        <Label htmlFor={passwordId}>{t('users.account.temporaryPassword')}</Label>
        <Input id={passwordId} type="text" autoComplete="off" value={temporary} onChange={(e) => setTemporary(e.target.value)} dir="ltr" />
        <p className="text-xs text-muted-foreground">{passwordError ? t(`errors.${passwordError}`) : t('users.account.temporaryHint')}</p>
        <Button variant="secondary" disabled={!temporary || reset.isPending} onClick={() => reset.mutate(temporary, { onSuccess: () => setTemporary('') })}>
          {t('users.account.resetPassword')}
        </Button>
        {reset.isSuccess ? <Alert tone="success">{t('users.account.passwordReset')}</Alert> : null}
      </div>

      <section className="space-y-2 border-t border-border pt-4" aria-label={t('security.sessions.title')}>
        <h3 className="font-semibold">{t('security.sessions.title')}</h3>
        {sessions.data?.length === 0 ? <p className="text-muted-foreground">{t('users.account.noSessions')}</p> : null}
        <ul className="divide-y divide-border">
          {sessions.data?.map((session) => (
            <li key={session.id} className="py-2">
              <span className="block" dir="auto">
                {session.deviceLabel ?? t('common.unknown')}
              </span>
              <span className="text-xs text-muted-foreground">
                {session.location ?? t('security.locationUnknown')} · {formatDateTime(session.lastActiveAt, i18n.language)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 border-t border-border pt-4" aria-label={t('security.history.title')}>
        <h3 className="font-semibold">{t('security.history.title')}</h3>
        <ul className="divide-y divide-border">
          {history.data?.items.slice(0, 10).map((attempt) => (
            <li key={attempt.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{t(`security.history.reason.${attempt.reason}`)}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(attempt.occurredAt, i18n.language)}</span>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}

/** 005: one worker — status, template, access, assigned orders and account actions. Owner only. */
export function UserDetailPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const errorMessage = useErrorMessage();
  const user = useUser(id);

  if (user.error) return <Alert tone="danger">{errorMessage(user.error)}</Alert>;
  if (!user.data) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  const u = user.data;
  const status = userStatusKey(u);

  return (
    <section className="space-y-4">
      <Link to="/users" className="text-sm text-primary underline-offset-2 hover:underline">
        {t('users.title')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold" dir="auto">
          {u.displayName}
        </h1>
        <Badge tone={STATUS_TONE[status]}>{t(`workers.status.${status}`)}</Badge>
      </div>
      <Card className="space-y-1 text-sm">
        <p>
          <bdi dir="ltr">{u.username}</bdi> · {t(`language.${u.language}`)}
        </p>
        {u.template ? (
          <p className="text-muted-foreground">
            {t('users.startedFrom', { name: templateName(u.template, t) })}
            {u.template.deleted ? ` (${t('users.templateDeleted')})` : ''}
            {u.adjusted ? ` · ${t('users.adjusted')}` : ''}
          </p>
        ) : null}
        <p className="text-muted-foreground">
          {u.lastSignInAt ? t('users.lastSignIn', { date: formatDateTime(u.lastSignInAt, i18n.language) }) : t('users.neverSignedIn')}
        </p>
      </Card>
      {u.status === 'pending' ? (
        <Link
          to={`/users/${u.id}/approve`}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t('users.approve')}
        </Link>
      ) : null}
      {u.status !== 'pending' && u.status !== 'deleted' ? (
        <>
          <AccessCard key={u.id} user={u} />
          <AssignedOrders user={u} />
          <AccountCard key={`${u.id}-account`} user={u} />
        </>
      ) : null}
    </section>
  );
}
