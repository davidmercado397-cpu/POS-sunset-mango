import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { Toaster } from './components/toast';
import './index.css';
import { setHostTenant, STAFF_BASE, type HostTenant } from './lib/hostTenant';
import { applyBrand } from './lib/theme';
import { StoreBaseContext } from './pages/store/storeBase';
import { StorePage } from './pages/store/StorePage';
import { TrackPage } from './pages/store/TrackPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const root = createRoot(document.getElementById('root')!);
const render = (children: ReactNode, basename?: string) =>
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={basename}>
          {children}
          <Toaster />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );

/** Tienda en su propio subdominio o dominio: solo se muestran las páginas públicas. */
function StoreApp({ slug }: { slug: string }) {
  return (
    <StoreBaseContext.Provider value={{ slug, base: '' }}>
      <Routes>
        <Route path="/" element={<StorePage />} />
        <Route path="/pedido/:code" element={<TrackPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StoreBaseContext.Provider>
  );
}

const staffApp = (
  <AuthProvider>
    <App />
  </AuthProvider>
);

// Según el host:
// - subdominio propio de un restaurante: tienda en la raíz y app del personal en /admin;
// - tienda de un negocio (subdominio de tiendas o dominio propio): solo la tienda;
// - cualquier otro: la aplicación del punto de venta.
fetch('/api/public/host')
  .then((res) => (res.ok ? res.json() : { store: null, tenant: null }))
  .catch(() => ({ store: null, tenant: null }))
  .then(({ store, tenant }: { store: string | null; tenant?: HostTenant | null }) => {
    const path = window.location.pathname;
    if (tenant) {
      setHostTenant(tenant);
      applyBrand(tenant.primaryColor, tenant.secondaryColor);
      if (path === STAFF_BASE || path.startsWith(`${STAFF_BASE}/`)) render(staffApp, STAFF_BASE);
      else if (store) render(<StoreApp slug={store} />);
      else window.location.replace(STAFF_BASE);
    } else if (store) {
      render(<StoreApp slug={store} />);
    } else {
      render(staffApp);
    }
  });
