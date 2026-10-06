import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { SUPER_ADMIN_NAV, TENANT_NAV } from './components/navigation';
import { AccountPage } from './pages/AccountPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

// Módulos aún no construidos: se muestran como "Próximamente" según la fase del plan.
const pending = [...SUPER_ADMIN_NAV, ...TENANT_NAV].filter((i) => i.phase);

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="cuenta" element={<AccountPage />} />
          {pending.map((item) => (
            <Route key={item.to} path={item.to.slice(1)} element={<ComingSoonPage title={item.label} phase={item.phase} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
