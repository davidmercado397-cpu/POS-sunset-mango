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
}
