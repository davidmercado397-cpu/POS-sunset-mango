import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser, BranchContext } from '../auth-user';
import { BRANCH_MODULE_KEY, BRANCH_SCOPED_KEY, TENANT_MODULE_KEY } from '../decorators/branch.decorator';
import { AppModule, CORE_MODULES, effectiveModules, MODULE_CATALOG } from '../modules';

const moduleLabel = (m: string) => MODULE_CATALOG.find((x) => x.key === m)?.label ?? m;

/**
 * Resuelve la sede de la petición (encabezado X-Branch-Id), verifica que pertenezca al negocio
 * y que el usuario tenga acceso, y valida que los módulos requeridos estén activos.
 */
@Injectable()
export class BranchGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const tenantModule = this.reflector.getAllAndOverride<AppModule>(TENANT_MODULE_KEY, targets);
    const branchModule = this.reflector.getAllAndOverride<AppModule>(BRANCH_MODULE_KEY, targets);
    const scoped = this.reflector.getAllAndOverride<boolean>(BRANCH_SCOPED_KEY, targets) || !!branchModule;
    if (!tenantModule && !scoped) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser; branch?: BranchContext }>();
    const user = req.user;
    if (!user?.tenantId) throw new ForbiddenException('Esta acción pertenece a un negocio');

    if (tenantModule && !CORE_MODULES.includes(tenantModule) && !user.tenantModules.includes(tenantModule)) {
      throw new ForbiddenException(`El módulo "${moduleLabel(tenantModule)}" no está habilitado para este negocio`);
    }
    if (!scoped) return true;

    const branchId = req.header('x-branch-id');
    if (!branchId) throw new BadRequestException('Selecciona una sede');
    req.branch = await resolveBranch(this.prisma, user, branchId);

    if (branchModule && !req.branch.modules.includes(branchModule)) {
      throw new ForbiddenException(`El módulo "${moduleLabel(branchModule)}" no está activo en esta sede`);
    }
    return true;
  }
}

/** Valida que el usuario pueda operar en la sede y devuelve sus módulos efectivos. */
export async function resolveBranch(prisma: PrismaService, user: AuthUser, branchId: string): Promise<BranchContext> {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: user.tenantId!, isActive: true },
  });
  if (!branch) throw new ForbiddenException('Sede no encontrada');
  const canSeeAll = user.permissions.includes('branches.manage');
  if (!canSeeAll && !user.branchIds.includes(branch.id)) {
    throw new ForbiddenException('No tienes acceso a esta sede');
  }
  return { id: branch.id, name: branch.name, modules: effectiveModules(user.tenantModules, branch.activeModules) };
}
