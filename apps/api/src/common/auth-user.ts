import { Permission } from './permissions';

/** Usuario autenticado que queda disponible en `req.user`. */
export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  isSuperAdmin: boolean;
  tenantId: string | null;
  roleId: string | null;
  permissions: Permission[];
  branchIds: string[];
  /** Módulos que el Super Admin habilitó para el negocio */
  tenantModules: string[];
}

/** Sede validada para la petición actual (encabezado X-Branch-Id). */
export interface BranchContext {
  id: string;
  name: string;
  modules: string[];
}
