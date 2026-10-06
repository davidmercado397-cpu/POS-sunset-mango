import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { SUPER_ADMIN_NAV, TENANT_NAV, type NavItem } from './components/navigation';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/admin/AdminPage';
import { CashPage } from './pages/cash/CashPage';
import { CatalogPage } from './pages/catalog/CatalogPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { KitchenPage } from './pages/kitchen/KitchenPage';
import { PurchasesPage } from './pages/inventory/PurchasesPage';
import { TransfersPage } from './pages/inventory/TransfersPage';
import { PosPage } from './pages/pos/PosPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { SalesPage } from './pages/sales/SalesPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { OnlineOrdersPage } from './pages/online/OnlineOrdersPage';
import { StorePage } from './pages/store/StorePage';
import { TrackPage } from './pages/store/TrackPage';
import { TenantsPage } from './pages/platform/TenantsPage';
import { TablesPage } from './pages/tables/TablesPage';

/** Pantalla de cada ruta del menú. Las que aún no existen muestran "Próximamente". */
const PAGES: Record<string, ReactNode> = {
  '/negocios': <TenantsPage />,
  '/admin': <AdminPage />,
  '/catalogo': <CatalogPage />,
  '/pos': <PosPage />,
  '/caja': <CashPage />,
  '/ventas': <SalesPage />,
  '/inventario': <InventoryPage />,
  '/compras': <PurchasesPage />,
  '/traslados': <TransfersPage />,
  '/cocina': <KitchenPage />,
  '/reportes': <ReportsPage />,
  '/mesas': <TablesPage />,
  '/pedidos-online': <OnlineOrdersPage />,
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
      {/* Tienda pública: sin usuario ni contraseña */}
      <Route path="/pedir/:slug" element={<StorePage />} />
      <Route path="/pedir/:slug/pedido/:code" element={<TrackPage />} />
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
