import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { api } from '@/api/http';
import { queryKeys, useMe } from '@/api/queries';
import { useUsers } from '@/api/users';
import { LanguageSwitcher, useAccountLanguage } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { useAccess } from '@/lib/access';
import { cn } from '@/lib/utils';

/** Authenticated layout: header with company name, a thumb-friendly menu, and the page. */
export function AppShell() {
  const { t } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  useAccountLanguage();
  const isOwner = me.data?.user.role === 'owner';
  const companyName = me.data?.company.name.trim();
  // 005 FR-003: the Owner sees how many registrations wait for approval.
  const pending = useUsers({}, isOwner).data?.pendingCount ?? 0;

  const signOut = useMutation({
    mutationFn: () => api<void>('POST', '/api/auth/sign-out'),
    onSettled: async () => {
      queryClient.setQueryData(queryKeys.me, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] && q.queryKey[0] !== queryKeys.setupStatus[0] });
      await navigate('/sign-in', { replace: true });
    },
  });

  // 005 FR-012: the menu shows only what the user may use; Users and the audit log stay the Owner's.
  const access = useAccess();
  const link = (to: string, label: string, shown: boolean, end = false) => (shown ? [{ to, label, end }] : []);
  const links = [
    ...link('/', t('nav.dashboard'), true, true),
    ...link('/orders', t('nav.orders'), access.reachesOrders),
    ...link('/customers', t('nav.customers'), access.can('customers')),
    ...link('/suppliers', t('nav.suppliers'), access.can('suppliers')),
    ...link('/security', t('nav.security'), true),
    ...link('/users', pending > 0 ? t('nav.usersPending', { count: pending }) : t('nav.users'), isOwner),
    ...link('/settings', t('nav.settings'), access.can('settings') || access.can('rates')),
    ...link('/audit', t('nav.audit'), isOwner),
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
          <NavLink to="/" className="min-w-0 truncate py-2 text-base font-semibold text-primary" dir="auto">
            {companyName || t('app.name')}
          </NavLink>
          <Button
            variant="secondary"
            aria-expanded={menuOpen}
            aria-controls="app-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {t('nav.menu')}
          </Button>
        </div>
        {menuOpen ? (
          <nav id="app-menu" className="mx-auto max-w-3xl border-t border-border px-4 pb-3 pt-2">
            <ul className="space-y-1">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-11 items-center rounded-lg px-3 text-base',
                        isActive ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted',
                      )
                    }
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => signOut.mutate()}
                  disabled={signOut.isPending}
                  className="flex min-h-11 w-full items-center rounded-lg px-3 text-start text-base text-danger hover:bg-muted"
                >
                  {t('nav.signOut')}
                </button>
              </li>
            </ul>
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">{t('language.label')}</p>
              <LanguageSwitcher />
            </div>
          </nav>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-5">
        <Outlet />
      </main>
    </div>
  );
}
