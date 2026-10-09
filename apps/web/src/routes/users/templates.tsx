import { ORDER_SCOPES, type OrderScope, type PermissionSet, type RoleTemplate } from '@hanjing/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { useCreateTemplate, useDeleteTemplate, useTemplates, useUpdateTemplate } from '@/api/users';
import { ConfirmAction } from '@/components/ConfirmAction';
import { Field } from '@/components/Field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { templateName } from '@/lib/workers';
import { TemplateSummary } from './approve';
import { PermissionEditor } from './PermissionEditor';

/** 005 FR-015 – FR-017: reusable role templates. Changing one never changes workers already set up. */
export function TemplatesPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const templates = useTemplates();
  return (
    <section className="space-y-4">
      <Link to="/users" className="text-sm text-primary underline-offset-2 hover:underline">
        {t('users.title')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('users.templates.title')}</h1>
        <Link
          to="/users/templates/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t('users.templates.new')}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">{t('users.templates.hint')}</p>
      {templates.error ? <Alert tone="danger">{errorMessage(templates.error)}</Alert> : null}
      <ul className="space-y-2">
        {templates.data?.map((tpl) => (
          <li key={tpl.id}>
            <Link to={`/users/templates/${tpl.id}`} className="block rounded-xl border border-border bg-surface p-4 hover:bg-muted">
              <span className="block font-semibold" dir="auto">
                {templateName(tpl, t)}
              </span>
              <TemplateSummary template={tpl} />
              <span className="block text-xs text-muted-foreground">{t('users.templates.usedBy', { count: tpl.usedBy })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface TemplateDraft {
  name: string;
  permissions: PermissionSet;
  orderScope: OrderScope;
  ownEntriesOnly: boolean;
}

function TemplateForm({ template }: { template: RoleTemplate | null }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const scopeId = useId();
  const [draft, setDraft] = useState<TemplateDraft>(() => ({
    name: template?.name ?? '',
    permissions: template?.permissions ?? { modules: {}, hidden: [] },
    orderScope: template?.orderScope ?? 'all',
    ownEntriesOnly: template?.ownEntriesOnly ?? false,
  }));
  const create = useCreateTemplate();
  const update = useUpdateTemplate(template?.id ?? '');
  const remove = useDeleteTemplate(template?.id ?? '');
  const save = template ? update : create;
  const nameError = fieldErrors(save.error).name;
  const isDefault = Boolean(template?.defaultKey);

  const onSave = () => {
    const body = { permissions: draft.permissions, orderScope: draft.orderScope, ownEntriesOnly: draft.ownEntriesOnly };
    const name = draft.name.trim();
    if (template) update.mutate({ ...body, name: name || (isDefault ? null : name) }, { onSuccess: () => void navigate('/users/templates') });
    else create.mutate({ ...body, name }, { onSuccess: () => void navigate('/users/templates') });
  };

  return (
    <Card className="space-y-5">
      <Field
        label={t('users.templates.name')}
        hint={isDefault ? t('users.templates.defaultNameHint', { name: templateName({ name: null, defaultKey: template!.defaultKey }, t) }) : undefined}
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        placeholder={isDefault ? templateName({ name: null, defaultKey: template!.defaultKey }, t) : undefined}
        error={nameError ? t(`errors.${nameError}`) : null}
        maxLength={60}
        dir="auto"
      />
      <PermissionEditor value={draft.permissions} onChange={(permissions) => setDraft((d) => ({ ...d, permissions }))} />
      <fieldset className="space-y-2">
        <legend id={scopeId} className="font-semibold">
          {t('users.scope.title')}
        </legend>
        {ORDER_SCOPES.map((scope) => (
          <label key={scope} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="radio"
              name={scopeId}
              className="size-5"
              checked={draft.orderScope === scope}
              onChange={() => setDraft((d) => ({ ...d, orderScope: scope }))}
            />
            {t(`workers.scope.${scope}`)}
          </label>
        ))}
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-5"
            checked={draft.ownEntriesOnly}
            onChange={(e) => setDraft((d) => ({ ...d, ownEntriesOnly: e.target.checked }))}
          />
          {t('users.scope.ownEntries')}
        </label>
      </fieldset>
      {save.error && !nameError ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={save.isPending} onClick={onSave}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
        {template ? (
          <ConfirmAction
            label={t('common.delete')}
            title={t('users.templates.deleteTitle')}
            body={t('users.templates.deleteBody')}
            confirmLabel={t('common.delete')}
            danger
            pending={remove.isPending}
            error={remove.error}
            onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate('/users/templates', { replace: true }) })}
          />
        ) : null}
      </div>
    </Card>
  );
}

export function TemplateFormPage() {
  const { t } = useTranslation();
  const { templateId } = useParams();
  const templates = useTemplates();
  const template = templateId ? (templates.data?.find((tpl) => tpl.id === templateId) ?? null) : null;
  if (templateId && !templates.data) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  return (
    <section className="space-y-4">
      <Link to="/users/templates" className="text-sm text-primary underline-offset-2 hover:underline">
        {t('users.templates.title')}
      </Link>
      <h1 className="text-xl font-semibold" dir="auto">
        {template ? templateName(template, t) : t('users.templates.new')}
      </h1>
      {templateId && !template ? <Alert tone="danger">{t('errors.not_found')}</Alert> : <TemplateForm key={templateId ?? 'new'} template={template} />}
    </section>
  );
}
