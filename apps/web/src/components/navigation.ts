import {
  ArrowLeftRight, BarChart3, Bike, Building2, ChefHat, Grid3x3, Home, Package, Receipt, Settings, ShoppingBag,
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
  { to: '/negocios', label: 'Negocios', icon: Building2, superAdmin: true },
];

export const TENANT_NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/pos', label: 'Vender', icon: ShoppingCart, anyPermission: ['pos.sell'], module: 'pos' },
  { to: '/caja', label: 'Caja', icon: Wallet, anyPermission: ['cash.open', 'cash.close', 'cash.view', 'cash.movements'], module: 'cash' },
  { to: '/ventas', label: 'Ventas', icon: Receipt, anyPermission: ['sales.view'], module: 'pos' },
  { to: '/pedidos-online', label: 'Pedidos en línea', icon: Bike, anyPermission: ['online.manage'], module: 'online' },
  { to: '/mesas', label: 'Mesas', icon: Grid3x3, anyPermission: ['tables.manage'], module: 'tables' },
  { to: '/cocina', label: 'Cocina', icon: ChefHat, anyPermission: ['kitchen.view'], module: 'kitchen' },
  { to: '/catalogo', label: 'Catálogo', icon: Utensils, anyPermission: ['catalog.manage'] },
  { to: '/inventario', label: 'Inventario', icon: Package, anyPermission: ['inventory.view'], module: 'inventory' },
  { to: '/compras', label: 'Compras', icon: ShoppingBag, anyPermission: ['purchases.manage'], module: 'purchases' },
  { to: '/traslados', label: 'Traslados', icon: ArrowLeftRight, anyPermission: ['transfers.manage'], module: 'transfers' },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, anyPermission: ['reports.view'], module: 'reports' },
  { to: '/admin', label: 'Administración', icon: Settings, anyPermission: ['branches.manage', 'users.manage', 'roles.manage', 'settings.manage', 'expenses.categories', 'audit.view'] },
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
