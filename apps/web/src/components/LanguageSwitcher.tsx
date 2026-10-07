import { LANGUAGES, type Language, type MeResponse } from '@hanjing/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/http';
import { queryKeys, useMe } from '@/api/queries';
import { cn } from '@/lib/utils';

/** Three large options, each labelled in its own language. Signed in, the choice is saved on the account (FR-026). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const me = useMe();

  const save = useMutation({
    mutationFn: (language: Language) => api<MeResponse>('PATCH', '/api/me', { language }),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.me, data),
  });

  function choose(language: Language) {
    void i18n.changeLanguage(language);
    if (me.data && me.data.user.language !== language) save.mutate(language);
  }

  return (
    <div role="group" aria-label={t('language.label')} className={cn('flex gap-1 rounded-lg bg-muted p-1', className)}>
      {LANGUAGES.map((lng) => {
        const active = i18n.language === lng;
        return (
          <button
            key={lng}
            type="button"
            lang={lng}
            aria-pressed={active}
            onClick={() => choose(lng)}
            className={cn(
              'min-h-11 flex-1 rounded-md px-3 text-sm font-medium transition-colors',
              active ? 'bg-surface text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`language.${lng}`)}
          </button>
        );
      })}
    </div>
  );
}

/** After sign-in the account's language wins over the device's last choice. */
export function useAccountLanguage() {
  const { i18n } = useTranslation();
  const me = useMe();
  const accountLanguage = me.data?.user.language;
  useEffect(() => {
    if (accountLanguage && accountLanguage !== i18n.language) void i18n.changeLanguage(accountLanguage);
  }, [accountLanguage, i18n]);
}
