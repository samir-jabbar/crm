import {
  displayNameSchema,
  LANGUAGES,
  passwordSchema,
  usernameSchema,
  type Language,
  type RegisterRequest,
} from '@hanjing/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { fieldErrors, useErrorMessage } from '@/api/errors';
import { api, ApiError } from '@/api/http';
import { Field, PasswordField } from '@/components/Field';
import { PublicLayout } from '@/components/PublicLayout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { isLanguage } from '@/i18n';

interface Fields {
  username: string;
  displayName: string;
  password: string;
  confirm: string;
}
type FieldName = keyof Fields;

const clientSchemas = { username: usernameSchema, displayName: displayNameSchema, password: passwordSchema } as const;

/** 005 FR-001 – FR-002 (D9): a new worker registers, then waits for the Owner's approval. */
export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const [values, setValues] = useState<Fields>({ username: '', displayName: '', password: '', confirm: '' });
  const [localErrors, setLocalErrors] = useState<Partial<Record<FieldName, string>>>({});
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'en';

  const mutation = useMutation({
    mutationFn: (body: RegisterRequest) => api<{ status: 'pending' }>('POST', '/api/auth/register', body),
  });

  const serverFields = fieldErrors(mutation.error);
  const errorFor = (name: FieldName) => {
    if (localErrors[name]) return localErrors[name] === 'mismatch' ? t('register.mismatch') : t(`errors.${localErrors[name]}`);
    if (serverFields[name]) return t(`errors.${serverFields[name]}`);
    return null;
  };
  const topError =
    mutation.error && !(mutation.error instanceof ApiError && mutation.error.code === 'validation_failed') ? errorMessage(mutation.error) : null;
  const set = (name: FieldName) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors: Partial<Record<FieldName, string>> = {};
    for (const [name, schema] of Object.entries(clientSchemas) as [keyof typeof clientSchemas, (typeof clientSchemas)[keyof typeof clientSchemas]][]) {
      const result = schema.safeParse(values[name]);
      if (!result.success) errors[name] = result.error.issues[0]?.message ?? 'invalid_value';
    }
    if (!errors.password && values.password !== values.confirm) errors.confirm = 'mismatch';
    setLocalErrors(errors);
    if (Object.keys(errors).length > 0) return;
    mutation.mutate({ username: values.username, displayName: values.displayName, password: values.password, language });
  }

  if (mutation.isSuccess) {
    return (
      <PublicLayout>
        <h1 className="text-2xl font-semibold">{t('register.doneTitle')}</h1>
        <Card className="mt-6 space-y-4">
          <p>{t('register.doneBody')}</p>
          <Link to="/sign-in" className="inline-flex min-h-11 items-center text-primary underline-offset-2 hover:underline">
            {t('register.toSignIn')}
          </Link>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{t('register.title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('register.intro')}</p>
      <Card className="mt-6">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <Label htmlFor="register-language">{t('setup.language')}</Label>
            <Select id="register-language" value={language} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
              {LANGUAGES.map((lng) => (
                <option key={lng} value={lng} lang={lng}>
                  {t(`language.${lng}`)}
                </option>
              ))}
            </Select>
          </div>
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
          <PasswordField
            label={t('register.confirm')}
            value={values.confirm}
            onChange={set('confirm')}
            error={errorFor('confirm')}
            autoComplete="new-password"
          />
          {topError ? <Alert tone="danger">{topError}</Alert> : null}
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? t('register.submitting') : t('register.submit')}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link to="/sign-in" className="text-primary underline-offset-2 hover:underline">
          {t('register.haveAccount')}
        </Link>
      </p>
    </PublicLayout>
  );
}
