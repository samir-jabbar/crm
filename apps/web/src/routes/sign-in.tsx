import type { MeResponse, SignInRequest } from '@hanjing/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useErrorMessage } from '@/api/errors';
import { api } from '@/api/http';
import { queryKeys } from '@/api/queries';
import { Field, PasswordField } from '@/components/Field';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PublicLayout } from '@/components/PublicLayout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function SignInPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<SignInRequest>({ username: '', password: '' });

  const mutation = useMutation({
    mutationFn: (body: SignInRequest) => api<MeResponse>('POST', '/api/auth/sign-in', body),
    onSuccess: async (me) => {
      queryClient.setQueryData(queryKeys.me, me);
      const from = (location.state as { from?: string } | null)?.from;
      await navigate(from && from !== '/sign-in' ? from : '/', { replace: true });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!values.username.trim() || !values.password) return;
    mutation.mutate(values);
  }

  return (
    <PublicLayout toolbar={<LanguageSwitcher className="w-full max-w-64" />}>
      <h1 className="text-2xl font-semibold">{t('signIn.title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('signIn.subtitle')}</p>
      <Card className="mt-6">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Field
            label={t('signIn.username')}
            value={values.username}
            onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            required
          />
          <PasswordField
            label={t('signIn.password')}
            value={values.password}
            onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
            autoComplete="current-password"
            required
          />
          {mutation.error ? <Alert tone="danger">{errorMessage(mutation.error)}</Alert> : null}
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? t('signIn.submitting') : t('signIn.submit')}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">{t('signIn.forgot')}</p>
    </PublicLayout>
  );
}
