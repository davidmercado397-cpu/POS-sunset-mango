import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { effectiveModules } from '../common/modules';
import { isValidPermission } from '../common/permissions';
import { ENV, Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password';

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');


@Injectable()
export class AuthService {
  // Hash real usado para igualar el tiempo de respuesta cuando el usuario no existe.
  private readonly dummyHash = hashPassword(randomUUID());

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(username: string, password: string, client: ClientInfo): Promise<IssuedTokens> {
    const invalid = new UnauthorizedException('Usuario o contraseña incorrectos');
    const user = await this.prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
      include: { tenant: true },
    });

    if (!user) {
      await verifyPassword(await this.dummyHash, password);
      throw invalid;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Usuario bloqueado por intentos fallidos. Intenta de nuevo en ${minutes} min`);
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= this.env.maxLoginAttempts;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lock ? 0 : attempts,
          lockedUntil: lock ? new Date(Date.now() + this.env.lockMinutes * 60000) : null,
        },
      });
      await this.audit.log({
        tenantId: user.tenantId,
        userId: user.id,
        action: lock ? 'auth.locked' : 'auth.login_failed',
        ip: client.ip,
      });
      throw invalid;
    }

    if (!user.isActive) throw new UnauthorizedException('Usuario inactivo');
    if (user.tenant && !user.tenant.isActive) throw new UnauthorizedException('El negocio está suspendido');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: 'auth.login', ip: client.ip });

    return this.issueTokens(user.id, randomUUID(), client);
  }

  /** Rota el refresh token. Si se presenta uno ya revocado, se asume robo y se revoca toda la sesión. */
  async refresh(rawToken: string | undefined, client: ClientInfo): Promise<IssuedTokens> {
    if (!rawToken) throw new UnauthorizedException('Sesión expirada');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { include: { tenant: true } } },
    });
    if (!stored) throw new UnauthorizedException('Sesión expirada');

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        tenantId: stored.user.tenantId,
        userId: stored.userId,
        action: 'auth.refresh_reuse',
        ip: client.ip,
      });
      throw new UnauthorizedException('Sesión inválida');
    }

    const { user } = stored;
    if (stored.expiresAt < new Date() || !user.isActive || (user.tenant && !user.tenant.isActive)) {
      throw new UnauthorizedException('Sesión expirada');
    }

    // Revocación condicional: si dos peticiones usan el mismo token a la vez, solo una gana.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException('Sesión inválida');

    return this.issueTokens(user.id, stored.familyId, client);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string): Promise<void> {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(record.passwordHash, currentPassword))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
      // Cierra las demás sesiones abiertas.
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: 'auth.password_changed' });
  }

  /** Datos de la sesión que necesita el frontend: usuario, negocio, marca, sedes y módulos. */
  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
      include: {
        role: true,
        tenant: true,
        branches: { include: { branch: true } },
      },
    });

    const tenant = user.tenant;
    // Quien administra sedes ve todas las del negocio; los demás, solo las asignadas.
    const seesAllBranches = authUser.permissions.includes('branches.manage');
    const branches = tenant
      ? seesAllBranches
        ? await this.prisma.branch.findMany({ where: { tenantId: tenant.id, isActive: true }, orderBy: { name: 'asc' } })
        : user.branches.map((ub) => ub.branch).filter((b) => b.isActive)
      : [];

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        role: user.role ? { id: user.role.id, name: user.role.name } : null,
        permissions: (user.role?.permissions ?? []).filter(isValidPermission),
      },
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            brandName: tenant.brandName ?? tenant.name,
            logoUrl: tenant.logoUrl,
            primaryColor: tenant.primaryColor,
            secondaryColor: tenant.secondaryColor,
            enabledModules: tenant.enabledModules,
          }
        : null,
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        modules: effectiveModules(tenant?.enabledModules ?? [], b.activeModules),
      })),
    };
  }

  private async issueTokens(userId: string, familyId: string, client: ClientInfo): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId });
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.env.refreshTtlDays * 86400000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 255),
      },
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }
}
