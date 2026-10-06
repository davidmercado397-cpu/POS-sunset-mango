import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../auth-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { isValidPermission } from '../permissions';

export interface AccessTokenPayload {
  sub: string;
}

/**
 * Valida el JWT de acceso y carga el usuario desde la base de datos en cada petición,
 * para que una desactivación, suspensión del negocio o cambio de rol tenga efecto inmediato.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('No autenticado');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Sesión expirada');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, tenant: true, branches: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Usuario inactivo');
    if (user.tenant && !user.tenant.isActive) throw new UnauthorizedException('Negocio suspendido');

    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
      tenantId: user.tenantId,
      roleId: user.roleId,
      permissions: user.isSuperAdmin ? [] : (user.role?.permissions ?? []).filter(isValidPermission),
      branchIds: user.branches.map((b) => b.branchId),
      tenantModules: user.tenant?.enabledModules ?? [],
    };
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
