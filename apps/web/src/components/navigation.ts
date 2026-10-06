import {
  ArrowLeftRight, BarChart3, Building2, ChefHat, Grid3x3, Home, Package, Receipt, Settings, ShoppingBag,
  ShoppingCart, UserCog, Utensils, Wallet, type LucideIcon,
} from 'lucide-react';
import type { AppModule } from '../auth/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Basta con tener uno de estos permisos */
  anyPermission?: string[];
  module?: AppModule;
  superAdmin?: boolean;
  /** Fase del plan en la que se construye (para mostrar "Próximamente") */
  phase?: number;
}

export const SUPER_ADMIN_NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, superAdmin: true },
  { to: '/negocios', label: 'Negocios', icon: Building2, superAdmin: true, phase: 2 },
];

export const TENANT_NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/pos', label: 'Vender', icon: ShoppingCart, anyPermission: ['pos.sell'], module: 'pos', phase: 5 },
  { to: '/caja', label: 'Caja', icon: Wallet, anyPermission: ['cash.open', 'cash.close', 'cash.view'], module: 'cash', phase: 4 },
  { to: '/ventas', label: 'Ventas', icon: Receipt, anyPermission: ['sales.view'], module: 'pos', phase: 5 },
  { to: '/mesas', label: 'Mesas', icon: Grid3x3, anyPermission: ['tables.manage'], module: 'tables', phase: 9 },
  { to: '/cocina', label: 'Cocina', icon: ChefHat, anyPermission: ['kitchen.view'], module: 'kitchen', phase: 7 },
  { to: '/catalogo', label: 'Catálogo', icon: Utensils, anyPermission: ['catalog.manage'], phase: 3 },
  { to: '/inventario', label: 'Inventario', icon: Package, anyPermission: ['inventory.view'], module: 'inventory', phase: 6 },
  { to: '/compras', label: 'Compras', icon: ShoppingBag, anyPermission: ['purchases.manage'], module: 'purchases', phase: 6 },
  { to: '/traslados', label: 'Traslados', icon: ArrowLeftRight, anyPermission: ['transfers.manage'], module: 'transfers', phase: 6 },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, anyPermission: ['reports.view'], module: 'reports', phase: 8 },
  { to: '/admin', label: 'Administración', icon: Settings, anyPermission: ['branches.manage', 'users.manage', 'roles.manage', 'settings.manage'], phase: 2 },
];

export const ACCOUNT_NAV: NavItem = { to: '/cuenta', label: 'Mi cuenta', icon: UserCog };

export function visibleNav(
  isSuperAdmin: boolean,
  can: (p: string) => boolean,
  hasModule: (m: AppModule) => boolean,
): NavItem[] {
  if (isSuperAdmin) return SUPER_ADMIN_NAV;
  return TENANT_NAV.filter(
    (item) => (!item.anyPermission || item.anyPermission.some(can)) && (!item.module || hasModule(item.module)),
  );
}
