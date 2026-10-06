import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth-user';
import { ANY_PERMISSION_KEY, PERMISSIONS_KEY, SUPER_ADMIN_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, targets);
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    const anyOf = this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSION_KEY, targets) ?? [];
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;

    if (!superAdminOnly && !required.length && !anyOf.length) return true;
    if (!user) throw new ForbiddenException();

    if (superAdminOnly) {
      if (!user.isSuperAdmin) throw new ForbiddenException('Solo el Super Admin puede hacer esto');
      return true;
    }

    // Los permisos de negocio solo aplican a usuarios de un negocio.
    if (!user.tenantId) throw new ForbiddenException('Esta acción pertenece a un negocio');
    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length) throw new ForbiddenException('No tienes permiso para esta acción');
    if (anyOf.length && !anyOf.some((p) => user.permissions.includes(p))) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
