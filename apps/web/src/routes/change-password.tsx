import { passwordSchema } from '@hanjing/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { api, ApiError } from '@/api/http';
import { queryKeys } from '@/api/queries';
import { PasswordField } from '@/components/Field';
import { PublicLayout } from '@/components/PublicLayout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** 005 FR-037: after the Owner sets a temporary password, the worker chooses their own before anything else. */
export function ChangePasswordPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api<void>('POST', '/api/me/password', { currentPassword: current, newPassword: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      await navigate('/', { replace: true });
    },
  });
  const server = fieldErrors(mutation.error);
  const top = mutation.error && !(mutation.error instanceof ApiError && mutation.error.code === 'validation_failed') ? errorMessage(mutation.error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(next);
    if (!parsed.success) return setLocalError(t(`errors.${parsed.error.issues[0]?.message ?? 'invalid_value'}`));
    if (next !== confirm) return setLocalError(t('security.password.mismatch'));
    setLocalError(null);
    mutation.mutate();
  }

  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{t('changePassword.title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('changePassword.intro')}</p>
      <Card className="mt-6">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <PasswordField
            label={t('changePassword.temporary')}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={server.currentPassword ? t(`errors.${server.currentPassword}`) : null}
            autoComplete="current-password"
          />
          <PasswordField
            label={t('security.password.new')}
            hint={t('setup.passwordHint')}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={localError ?? (server.newPassword ? t(`errors.${server.newPassword}`) : null)}
            autoComplete="new-password"
          />
          <PasswordField label={t('security.password.confirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {top ? <Alert tone="danger">{top}</Alert> : null}
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? t('security.password.submitting') : t('security.password.submit')}
          </Button>
        </form>
      </Card>
    </PublicLayout>
  );
}
