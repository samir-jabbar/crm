import { MODULES, type RoleTemplate } from '@hanjing/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { useApproveUser, useTemplates, useUser } from '@/api/users';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { templateName } from '@/lib/workers';

/** One line per template: the modules it opens, and its scope. */
export function TemplateSummary({ template }: { template: Pick<RoleTemplate, 'permissions' | 'orderScope' | 'ownEntriesOnly'> }) {
  const { t } = useTranslation();
  const modules = MODULES.filter((m) => template.permissions.modules[m]).map((m) => t(`workers.module.${m}`));
  return (
    <span className="block text-xs text-muted-foreground">
      {modules.length ? modules.join(' · ') : t('workers.action.none')}
      {' — '}
      {t(`workers.scope.${template.orderScope}`)}
      {template.ownEntriesOnly ? ` · ${t('users.ownEntriesOnly')}` : ''}
    </span>
  );
}

/** 005 FR-004: approve a registration with a role template. Its permissions can be adjusted afterwards. */
export function ApproveUserPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const groupId = useId();
  const user = useUser(id);
  const templates = useTemplates();
  const approve = useApproveUser(id);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const chosen = templateId ?? templates.data?.[0]?.id ?? null;

  if (user.error) return <Alert tone="danger">{errorMessage(user.error)}</Alert>;
  if (!user.data || !templates.data) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
    <section className="space-y-4">
      <Link to="/users" className="text-sm text-primary underline-offset-2 hover:underline">
        {t('users.title')}
      </Link>
      <h1 className="text-xl font-semibold" dir="auto">
        {t('users.approveName', { name: user.data.displayName })}
      </h1>
      <Card className="space-y-3">
        <p id={groupId} className="font-medium">
          {t('users.chooseTemplate')}
        </p>
        <div role="radiogroup" aria-labelledby={groupId} className="space-y-2">
          {templates.data.map((tpl) => (
            <label key={tpl.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted">
              <input
                type="radio"
                name="template"
                className="mt-1 size-5"
                checked={chosen === tpl.id}
                onChange={() => setTemplateId(tpl.id)}
              />
              <span>
                <span className="block font-medium" dir="auto">
                  {templateName(tpl, t)}
                </span>
                <TemplateSummary template={tpl} />
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{t('users.adjustLater')}</p>
        {approve.error ? <Alert tone="danger">{errorMessage(approve.error)}</Alert> : null}
        <Button
          size="lg"
          disabled={!chosen || approve.isPending}
          onClick={() =>
            chosen && approve.mutate({ templateId: chosen }, { onSuccess: () => void navigate(`/users/${id}`, { replace: true }) })
          }
        >
          {t('users.approve')}
        </Button>
      </Card>
    </section>
  );
}
