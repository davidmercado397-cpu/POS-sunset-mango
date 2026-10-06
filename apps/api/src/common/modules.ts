/**
 * Módulos funcionales del aplicativo.
 * - El Super Admin decide cuáles están disponibles para cada negocio (Tenant.enabledModules).
 * - El admin del negocio los activa por sede (Branch.activeModules).
 * Los módulos "core" siempre están disponibles y no se pueden apagar.
 */
export const APP_MODULES = {
  POS: 'pos',
  CASH: 'cash',
  TIPS: 'tips',
  INVENTORY: 'inventory',
  PURCHASES: 'purchases',
  TRANSFERS: 'transfers',
  KITCHEN: 'kitchen',
  TABLES: 'tables',
  REPORTS: 'reports',
} as const;

export type AppModule = (typeof APP_MODULES)[keyof typeof APP_MODULES];

export const CORE_MODULES: AppModule[] = [APP_MODULES.POS, APP_MODULES.CASH];

export const MODULE_CATALOG: { key: AppModule; label: string; description: string; core: boolean; dependsOn?: AppModule[] }[] = [
  { key: 'pos', label: 'Venta directa (POS)', description: 'Venta en mostrador con productos por foto', core: true },
  { key: 'cash', label: 'Caja', description: 'Apertura, gastos, cierre y cuadre por método de pago', core: true },
  { key: 'tips', label: 'Propinas', description: 'Registrar la propina al cobrar, si se recibe', core: false },
  { key: 'inventory', label: 'Inventario', description: 'Insumos, recetas, stock por sede, ajustes y mermas', core: false },
  { key: 'purchases', label: 'Compras y proveedores', description: 'Compras con costo y proveedores', core: false, dependsOn: ['inventory'] },
  { key: 'transfers', label: 'Traslados entre sedes', description: 'Enviar y recibir inventario entre sedes', core: false, dependsOn: ['inventory'] },
  { key: 'kitchen', label: 'Comandas a cocina', description: 'Pantalla de cocina en tiempo real', core: false },
  { key: 'tables', label: 'Mesas y pedidos abiertos', description: 'Cuentas abiertas por mesa', core: false },
  { key: 'reports', label: 'Reportes', description: 'Reportes de ventas, caja e inventario', core: false },
];

export const ALL_MODULE_KEYS = MODULE_CATALOG.map((m) => m.key);

export function isValidModule(key: string): key is AppModule {
  return (ALL_MODULE_KEYS as string[]).includes(key);
}

/** Módulos efectivos de una sede: core + (activos en sede ∩ habilitados en negocio). */
export function effectiveModules(tenantEnabled: string[], branchActive: string[]): AppModule[] {
  const enabled = new Set<string>([...CORE_MODULES, ...tenantEnabled]);
  const active = new Set<string>([...CORE_MODULES, ...branchActive]);
  return ALL_MODULE_KEYS.filter((k) => enabled.has(k) && active.has(k));
}
