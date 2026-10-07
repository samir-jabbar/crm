import '@/styles/index.css';
import '@/i18n';
import { DirectionProvider } from '@radix-ui/react-direction';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router/dom';
import { registerSW } from 'virtual:pwa-register';
import { queryClient } from '@/api/queryClient';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { router } from '@/router';

function App() {
  const { i18n } = useTranslation();
  return (
    <DirectionProvider dir={i18n.dir()}>
      <RouterProvider router={router} />
      <ConnectionBanner />
    </DirectionProvider>
  );
}

// Precached app shell (R16); updates apply automatically.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
