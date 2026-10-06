import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions';

export const PERMISSIONS_KEY = 'permissions';
export const SUPER_ADMIN_KEY = 'superAdmin';

/** Exige que el usuario tenga TODOS los permisos indicados dentro de su negocio. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** Ruta exclusiva del Super Admin de la plataforma. */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_KEY, true);
