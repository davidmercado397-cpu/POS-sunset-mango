import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { Toaster } from './components/toast';
import './index.css';
import { StoreBaseContext } from './pages/store/storeBase';
import { StorePage } from './pages/store/StorePage';
import { TrackPage } from './pages/store/TrackPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const root = createRoot(document.getElementById('root')!);
const render = (children: ReactNode) =>
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
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

// Si el host es la tienda de un negocio (subdominio o dominio propio), se abre la tienda;
// si no, la aplicación del punto de venta.
fetch('/api/public/host')
  .then((res) => (res.ok ? res.json() : { store: null }))
  .catch(() => ({ store: null }))
  .then(({ store }: { store: string | null }) => {
    if (store) {
      render(<StoreApp slug={store} />);
    } else {
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
    }
  });
