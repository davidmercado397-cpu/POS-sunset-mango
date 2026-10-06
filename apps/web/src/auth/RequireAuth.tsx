import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullScreenLoader } from '../components/FullScreenLoader';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
