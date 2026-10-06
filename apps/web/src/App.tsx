import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { SUPER_ADMIN_NAV, TENANT_NAV, type NavItem } from './components/navigation';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/admin/AdminPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { TenantsPage } from './pages/platform/TenantsPage';

/** Pantalla de cada ruta del menú. Las que aún no existen muestran "Próximamente". */
const PAGES: Record<string, ReactNode> = {
  '/negocios': <TenantsPage />,
  '/admin': <AdminPage />,
};

/** Protege una ruta según el permiso y módulo del ítem de menú. */
function Guarded({ item, children }: { item: NavItem; children: ReactNode }) {
  const { session, can, hasModule } = useAuth();
  if (!session) return null;
  const allowed = item.superAdmin
    ? session.user.isSuperAdmin
    : !session.user.isSuperAdmin && (!item.anyPermission || item.anyPermission.some(can)) && (!item.module || hasModule(item.module));
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
}

const routes = [...SUPER_ADMIN_NAV, ...TENANT_NAV].filter((i) => i.to !== '/');

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="cuenta" element={<AccountPage />} />
          {routes.map((item) => (
            <Route
              key={item.to}
              path={`${item.to.slice(1)}/*`}
              element={<Guarded item={item}>{PAGES[item.to] ?? <ComingSoonPage title={item.label} phase={item.phase} />}</Guarded>}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
