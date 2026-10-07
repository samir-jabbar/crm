import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Centered single-column layout for setup and sign-in, comfortable at 360px. */
export function PublicLayout({ children, toolbar }: { children: ReactNode; toolbar?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <span className="text-base font-semibold text-primary">{t('app.shortName')}</span>
        {toolbar}
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-10 pt-6">{children}</main>
    </div>
  );
}
