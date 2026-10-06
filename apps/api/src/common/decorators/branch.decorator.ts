import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { BranchContext } from '../auth-user';
import { AppModule } from '../modules';

export const BRANCH_SCOPED_KEY = 'branchScoped';
export const BRANCH_MODULE_KEY = 'branchModule';
export const TENANT_MODULE_KEY = 'tenantModule';

/** La ruta opera sobre una sede: exige el encabezado X-Branch-Id y valida el acceso. */
export const BranchScoped = () => SetMetadata(BRANCH_SCOPED_KEY, true);

/** La ruta opera sobre una sede y exige que el módulo esté activo en ella. */
export const RequireModule = (module: AppModule) => SetMetadata(BRANCH_MODULE_KEY, module);

/** Exige que el módulo esté habilitado para el negocio (rutas a nivel de negocio). */
export const RequireTenantModule = (module: AppModule) => SetMetadata(TENANT_MODULE_KEY, module);

export const CurrentBranch = createParamDecorator((_data: unknown, ctx: ExecutionContext): BranchContext => {
  return ctx.switchToHttp().getRequest().branch;
});
