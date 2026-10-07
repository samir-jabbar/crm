import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { OwnerOnly, RequireAuth, SetupOnly, SignedOutOnly } from '@/components/guards';
import { AuditPage } from '@/routes/audit';
import { CustomerDetailPage } from '@/routes/customers/detail';
import { CustomerFormPage } from '@/routes/customers/form';
import { CustomersListPage } from '@/routes/customers/list';
import { OrderDetailPage } from '@/routes/orders/detail';
import { EditOrderPage } from '@/routes/orders/edit';
import { OrdersListPage } from '@/routes/orders/list';
import { NewOrderPage } from '@/routes/orders/new';
import { SupplierDetailPage } from '@/routes/suppliers/detail';
import { SupplierFormPage } from '@/routes/suppliers/form';
import { SuppliersListPage } from '@/routes/suppliers/list';
import { DashboardPage } from '@/routes/dashboard';
import { SecurityPage } from '@/routes/security';
import { SettingsPage } from '@/routes/settings';
import { SetupPage } from '@/routes/setup';
import { SignInPage } from '@/routes/sign-in';
import { RouteError } from '@/routes/route-error';

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
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'orders', element: <OrdersListPage /> },
          { path: 'orders/new', element: <NewOrderPage /> },
          { path: 'orders/:id', element: <OrderDetailPage /> },
          { path: 'orders/:id/edit', element: <EditOrderPage /> },
          { path: 'customers', element: <CustomersListPage /> },
          { path: 'customers/new', element: <CustomerFormPage /> },
          { path: 'customers/:id', element: <CustomerDetailPage /> },
          { path: 'customers/:id/edit', element: <CustomerFormPage /> },
          { path: 'suppliers', element: <SuppliersListPage /> },
          { path: 'suppliers/new', element: <SupplierFormPage /> },
          { path: 'suppliers/:id', element: <SupplierDetailPage /> },
          { path: 'suppliers/:id/edit', element: <SupplierFormPage /> },
          { path: 'security', element: <SecurityPage /> },
          {
            path: 'settings',
            element: (
              <OwnerOnly>
                <SettingsPage />
              </OwnerOnly>
            ),
          },
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
