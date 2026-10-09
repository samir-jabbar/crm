import type { Module, PolicyAction } from '@hanjing/shared';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { OwnerOnly, RequireAny, RequireAuth, RequireModule, SetupOnly, SignedOutOnly } from '@/components/guards';
import { AuditPage } from '@/routes/audit';
import { CustomerDetailPage } from '@/routes/customers/detail';
import { CustomerFormPage } from '@/routes/customers/form';
import { CustomersListPage } from '@/routes/customers/list';
import { OrderDetailPage } from '@/routes/orders/detail';
import { EditOrderPage } from '@/routes/orders/edit';
import { OrdersListPage } from '@/routes/orders/list';
import { OrderPlanPage } from '@/routes/orders/plan';
import { NewOrderPage } from '@/routes/orders/new';
import { SupplierDetailPage } from '@/routes/suppliers/detail';
import { SupplierFormPage } from '@/routes/suppliers/form';
import { SuppliersListPage } from '@/routes/suppliers/list';
import { DashboardPage } from '@/routes/dashboard';
import { ExpenseDetailPage } from '@/routes/expenses/detail';
import { EditExpensePage, NewExpensePage } from '@/routes/expenses/form';
import { PaymentDetailPage } from '@/routes/payments/detail';
import { EditPaymentPage, NewPaymentPage } from '@/routes/payments/form';
import { ReimbursementsPage } from '@/routes/reimbursements';
import { SecurityPage } from '@/routes/security';
import { SettingsPage } from '@/routes/settings';
import { SetupPage } from '@/routes/setup';
import { SignInPage } from '@/routes/sign-in';
import { RouteError } from '@/routes/route-error';
import { RegisterPage } from '@/routes/register';
import { ChangePasswordPage } from '@/routes/change-password';
import { ApproveUserPage } from '@/routes/users/approve';
import { UserDetailPage } from '@/routes/users/detail';
import { UsersPage } from '@/routes/users/list';
import { TemplateFormPage, TemplatesPage } from '@/routes/users/templates';

type Guarded = [path: string, Page: ComponentType, module: Module | 'payments', action?: PolicyAction];

/** Routes shown only to users with the module and action (005 FR-012). */
const guarded = (routes: Guarded[]) =>
  routes.map(([path, Page, module, action]) => ({
    path,
    element: (
      <RequireModule module={module} action={action}>
        <Page />
      </RequireModule>
    ),
  }));

export const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <RouteError />,
    children: [
      {
        path: '/setup',
        element: (
          <SetupOnly>
            <SetupPage />
          </SetupOnly>
        ),
      },
      {
        path: '/sign-in',
        element: (
          <SignedOutOnly>
            <SignInPage />
          </SignedOutOnly>
        ),
      },
      {
        path: '/change-password',
        element: (
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        ),
      },
      {
        path: '/register',
        element: (
          <SignedOutOnly>
            <RegisterPage />
          </SignedOutOnly>
        ),
      },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          // 005 FR-012: each screen needs its module and action; the server enforces the same rules.
          ...guarded([
            ['orders', OrdersListPage, 'orders'],
            ['orders/new', NewOrderPage, 'orders', 'create'],
            ['orders/:id', OrderDetailPage, 'orders'],
            ['orders/:id/edit', EditOrderPage, 'orders', 'edit'],
            ['orders/:id/expenses/new', NewExpensePage, 'expenses', 'create'],
            ['expenses/:id', ExpenseDetailPage, 'expenses'],
            ['expenses/:id/edit', EditExpensePage, 'expenses', 'edit'],
            ['reimbursements', ReimbursementsPage, 'expenses'],
            ['orders/:id/payments/new', NewPaymentPage, 'payments', 'create'],
            ['orders/:id/payment-plan', OrderPlanPage, 'payments', 'edit'],
            ['payments/:id', PaymentDetailPage, 'payments'],
            ['payments/:id/edit', EditPaymentPage, 'payments', 'edit'],
            ['customers', CustomersListPage, 'customers'],
            ['customers/new', CustomerFormPage, 'customers', 'create'],
            ['customers/:id', CustomerDetailPage, 'customers'],
            ['customers/:id/edit', CustomerFormPage, 'customers', 'edit'],
            ['suppliers', SuppliersListPage, 'suppliers'],
            ['suppliers/new', SupplierFormPage, 'suppliers', 'create'],
            ['suppliers/:id', SupplierDetailPage, 'suppliers'],
            ['suppliers/:id/edit', SupplierFormPage, 'suppliers', 'edit'],
          ]),
          { path: 'security', element: <SecurityPage /> },
          {
            path: 'settings',
            element: (
              <RequireAny modules={['settings', 'rates']}>
                <SettingsPage />
              </RequireAny>
            ),
          },
          // 005: the Users area, Owner only (FR-011).
          ...(
            [
              ['users', UsersPage],
              ['users/:id', UserDetailPage],
              ['users/:id/approve', ApproveUserPage],
              ['users/templates', TemplatesPage],
              ['users/templates/new', TemplateFormPage],
              ['users/templates/:templateId', TemplateFormPage],
            ] as const
          ).map(([path, Page]) => ({
            path,
            element: (
              <OwnerOnly>
                <Page />
              </OwnerOnly>
            ),
          })),
          {
            path: 'audit',
            element: (
              <OwnerOnly>
                <AuditPage />
              </OwnerOnly>
            ),
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
