import {
  displayNameSchema,
  LANGUAGES,
  passwordSchema,
  usernameSchema,
  type Language,
  type MeResponse,
  type SetupRequest,
} from '@hanjing/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { api, ApiError } from '@/api/http';
import { queryKeys } from '@/api/queries';
import { Field, PasswordField } from '@/components/Field';
import { PublicLayout } from '@/components/PublicLayout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { isLanguage } from '@/i18n';

type Fields = Omit<SetupRequest, 'language'>;
type FieldName = keyof Fields;

const clientSchemas: Partial<Record<FieldName, { safeParse(v: unknown): { success: boolean; error?: { issues: { message: string }[] } } }>> = {
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
};

export function SetupPage() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Fields>({ setupCode: '', username: '', displayName: '', password: '' });
  const [localErrors, setLocalErrors] = useState<Partial<Record<FieldName, string>>>({});
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'en';

  const mutation = useMutation({
    mutationFn: (body: SetupRequest) => api<MeResponse>('POST', '/api/setup', body),
    onSuccess: async (me) => {
      queryClient.setQueryData(queryKeys.me, me);
      queryClient.setQueryData(queryKeys.setupStatus, { setupRequired: false });
      await navigate('/', { replace: true });
    },
  });

  const serverFields = fieldErrors(mutation.error);
  const errorFor = (name: FieldName) => {
    if (localErrors[name]) return t(`errors.${localErrors[name]}`);
    if (serverFields[name]) return t(`errors.${serverFields[name]}`);
    if (name === 'setupCode' && mutation.error instanceof ApiError && mutation.error.code === 'setup_code_invalid')
      return t('errors.setup_code_invalid');
    return null;
  };
  const topError =
    mutation.error && !(mutation.error instanceof ApiError && ['validation_failed', 'setup_code_invalid'].includes(mutation.error.code))
      ? errorMessage(mutation.error)
      : null;

  const set = (name: FieldName) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors: Partial<Record<FieldName, string>> = {};
    if (!values.setupCode.trim()) errors.setupCode = 'setup_code_invalid';
    for (const [name, schema] of Object.entries(clientSchemas) as [FieldName, NonNullable<(typeof clientSchemas)[FieldName]>][]) {
      const result = schema.safeParse(values[name]);
      if (!result.success) errors[name] = result.error?.issues[0]?.message ?? 'invalid_value';
    }
    setLocalErrors(errors);
    if (Object.keys(errors).length > 0) return;
    mutation.mutate({ ...values, language });
  }

  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{t('setup.title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('setup.intro')}</p>

      <Card className="mt-6">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <Label htmlFor="setup-language">{t('setup.language')}</Label>
            <Select
              id="setup-language"
              value={language}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
            >
              {LANGUAGES.map((lng) => (
                <option key={lng} value={lng} lang={lng}>
                  {t(`language.${lng}`)}
                </option>
              ))}
            </Select>
          </div>
          <Field
            label={t('setup.setupCode')}
            hint={t('setup.setupCodeHint')}
            value={values.setupCode}
            onChange={set('setupCode')}
            error={errorFor('setupCode')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            dir="ltr"
          />
          <Field
            label={t('setup.username')}
            hint={t('setup.usernameHint')}
            value={values.username}
            onChange={set('username')}
            error={errorFor('username')}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
          />
          <Field
            label={t('setup.displayName')}
            value={values.displayName}
            onChange={set('displayName')}
            error={errorFor('displayName')}
            autoComplete="name"
            dir="auto"
          />
          <PasswordField
            label={t('setup.password')}
            hint={t('setup.passwordHint')}
            value={values.password}
            onChange={set('password')}
            error={errorFor('password')}
            autoComplete="new-password"
          />
          {topError ? <Alert tone="danger">{topError}</Alert> : null}
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? t('setup.submitting') : t('setup.submit')}
          </Button>
        </form>
      </Card>
    </PublicLayout>
  );
}
