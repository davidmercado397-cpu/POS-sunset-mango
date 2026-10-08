import { AppModule } from './modules';

/**
 * Catálogo de permisos. Los roles guardan una lista de estas claves.
 * `module` indica qué módulo debe estar activo para que el permiso tenga efecto.
 */
export const PERMISSION_CATALOG = [
  // Administración del negocio
  { key: 'branches.manage', label: 'Administrar sedes', group: 'Administración' },
  { key: 'users.manage', label: 'Administrar usuarios', group: 'Administración' },
  { key: 'roles.manage', label: 'Administrar roles y permisos', group: 'Administración' },
  { key: 'settings.manage', label: 'Configuración, marca y módulos', group: 'Administración' },
  { key: 'audit.view', label: 'Ver auditoría', group: 'Administración' },
  // Catálogo
  { key: 'catalog.view', label: 'Ver catálogo', group: 'Catálogo' },
  { key: 'catalog.manage', label: 'Administrar productos y categorías', group: 'Catálogo' },
  { key: 'catalog.delete', label: 'Eliminar productos inactivos', group: 'Catálogo' },
  // POS y ventas
  { key: 'pos.sell', label: 'Vender en el POS', group: 'Ventas', module: 'pos' },
  { key: 'sales.view', label: 'Ver historial de ventas', group: 'Ventas', module: 'pos' },
  { key: 'sales.void', label: 'Anular ventas', group: 'Ventas', module: 'pos' },
  // Caja
  { key: 'cash.open', label: 'Abrir caja', group: 'Caja', module: 'cash' },
  { key: 'cash.close', label: 'Cerrar caja', group: 'Caja', module: 'cash' },
  { key: 'cash.movements', label: 'Registrar gastos y movimientos de efectivo', group: 'Caja', module: 'cash' },
  { key: 'cash.view', label: 'Ver historial de cierres', group: 'Caja', module: 'cash' },
  { key: 'cash.monthly', label: 'Hacer el cierre mensual', group: 'Caja', module: 'cash' },
  { key: 'cash.monthly_reopen', label: 'Reabrir un mes cerrado', group: 'Caja', module: 'cash' },
  { key: 'expenses.categories', label: 'Administrar categorías de gastos', group: 'Caja', module: 'cash' },
  // Inventario
  { key: 'inventory.view', label: 'Ver inventario', group: 'Inventario', module: 'inventory' },
  { key: 'inventory.manage', label: 'Administrar insumos y recetas', group: 'Inventario', module: 'inventory' },
  { key: 'inventory.adjust', label: 'Ajustes y mermas', group: 'Inventario', module: 'inventory' },
  { key: 'inventory.edit', label: 'Corregir movimientos y costos de inventario', group: 'Inventario', module: 'inventory' },
  { key: 'inventory.delete', label: 'Eliminar ítems inactivos sin movimientos', group: 'Inventario', module: 'inventory' },
  { key: 'purchases.manage', label: 'Registrar compras y proveedores', group: 'Inventario', module: 'purchases' },
  { key: 'transfers.manage', label: 'Traslados entre sedes', group: 'Inventario', module: 'transfers' },
  // Cocina y mesas
  { key: 'kitchen.view', label: 'Pantalla de cocina', group: 'Cocina', module: 'kitchen' },
  { key: 'tables.manage', label: 'Mesas y pedidos abiertos', group: 'Mesas', module: 'tables' },
  // Gastos administrativos
  { key: 'expenses.manage', label: 'Registrar gastos administrativos', group: 'Gastos administrativos', module: 'expenses' },
  // Pedidos en línea
  { key: 'online.manage', label: 'Gestionar pedidos en línea', group: 'Pedidos en línea', module: 'online' },
  // Reportes
  { key: 'reports.view', label: 'Ver reportes', group: 'Reportes', module: 'reports' },
] as const satisfies readonly { key: string; label: string; group: string; module?: AppModule }[];

export type Permission = (typeof PERMISSION_CATALOG)[number]['key'];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_CATALOG.map((p) => p.key);

export function isValidPermission(key: string): key is Permission {
  return (ALL_PERMISSIONS as string[]).includes(key);
}

/** Roles base que se crean con cada negocio nuevo. */
export const SYSTEM_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  {
    name: 'Administrador',
    description: 'Acceso total al negocio',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Administrador de sede',
    description: 'Opera la sede: caja, anulaciones, inventario y reportes',
    permissions: [
      'catalog.view', 'pos.sell', 'sales.view', 'sales.void',
      'cash.open', 'cash.close', 'cash.movements', 'cash.view', 'cash.monthly',
      'inventory.view', 'inventory.adjust', 'purchases.manage', 'transfers.manage',
      'kitchen.view', 'tables.manage', 'reports.view', 'online.manage',
    ],
  },
  {
    name: 'Cajero',
    description: 'Vende y maneja su caja',
    permissions: ['catalog.view', 'pos.sell', 'sales.view', 'cash.open', 'cash.close', 'cash.movements', 'tables.manage', 'online.manage'],
  },
  {
    name: 'Mesero',
    description: 'Toma pedidos en las mesas (si el negocio usa mesas)',
    permissions: ['catalog.view', 'tables.manage'],
  },
  {
    name: 'Cocina',
    description: 'Solo pantalla de cocina',
    permissions: ['kitchen.view'],
  },
];
