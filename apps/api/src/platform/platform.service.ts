import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { AuthUser } from '../common/auth-user';
import { CORE_MODULES, isValidModule, MODULE_CATALOG } from '../common/modules';
import { SYSTEM_ROLES } from '../common/permissions';
import { slugify } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './platform.dto';

const DEFAULT_EXPENSE_CATEGORIES = ['Proveedores', 'Servicios públicos', 'Nómina', 'Arriendo', 'Transporte', 'Aseo', 'Otros'];

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  modules() {
    return MODULE_CATALOG;
  }

  async list() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { branches: true, users: true } } },
    });
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      isActive: t.isActive,
      enabledModules: t.enabledModules,
      logoUrl: t.logoUrl,
      primaryColor: t.primaryColor,
      createdAt: t.createdAt,
      branches: t._count.branches,
      users: t._count.users,
    }));
  }

  async get(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        branches: { orderBy: { name: 'asc' } },
        users: { include: { role: true }, orderBy: { fullName: 'asc' } },
      },
    });
    if (!tenant) throw new NotFoundException('Negocio no encontrado');
    return {
      ...tenant,
      users: tenant.users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        isActive: u.isActive,
        role: u.role?.name ?? null,
        lastLoginAt: u.lastLoginAt,
      })),
    };
  }

  async create(dto: CreateTenantDto, actor: AuthUser) {
    const modules = this.cleanModules(dto.enabledModules);
    const slug = dto.slug || slugify(dto.name) || `negocio-${Date.now()}`;
    const username = dto.admin.username.trim().toLowerCase();

    if (await this.prisma.tenant.findUnique({ where: { slug } })) {
      throw new ConflictException('Ya existe un negocio con ese identificador');
    }
    if (await this.prisma.user.findUnique({ where: { username } })) {
      throw new ConflictException(`El usuario "${username}" ya existe`);
    }
    const passwordHash = await hashPassword(dto.admin.password);

    const tenant = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.name.trim(), slug, enabledModules: modules, brandName: dto.name.trim() },
      });
      const roles = await Promise.all(
        SYSTEM_ROLES.map((r) =>
          tx.role.create({ data: { tenantId: tenant.id, name: r.name, description: r.description, permissions: r.permissions, isSystem: true } }),
        ),
      );
      const branch = await tx.branch.create({
        data: { tenantId: tenant.id, name: dto.branchName?.trim() || 'Sede principal', activeModules: modules },
      });
      await tx.user.create({
        data: {
          tenantId: tenant.id,
          roleId: roles[0].id,
          fullName: dto.admin.fullName.trim(),
          username,
          passwordHash,
          branches: { create: { branchId: branch.id } },
        },
      });
      await tx.expenseCategory.createMany({
        data: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ tenantId: tenant.id, name })),
      });
      return tenant;
    });

    await this.audit.log({ userId: actor.id, action: 'platform.tenant_created', entity: 'Tenant', entityId: tenant.id, data: { name: tenant.name, modules } });
    return this.get(tenant.id);
  }

  async update(id: string, dto: UpdateTenantDto, actor: AuthUser) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Negocio no encontrado');
    const modules = dto.enabledModules ? this.cleanModules(dto.enabledModules) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id },
        data: { name: dto.name?.trim(), isActive: dto.isActive, enabledModules: modules },
      });
      // Si se retira un módulo del negocio, se apaga también en todas sus sedes.
      if (modules) {
        const branches = await tx.branch.findMany({ where: { tenantId: id } });
        for (const b of branches) {
          const active = b.activeModules.filter((m) => modules.includes(m));
          if (active.length !== b.activeModules.length) {
            await tx.branch.update({ where: { id: b.id }, data: { activeModules: active } });
          }
        }
      }
      // Suspender el negocio cierra todas las sesiones de sus usuarios.
      if (dto.isActive === false) {
        await tx.refreshToken.updateMany({ where: { user: { tenantId: id }, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    });

    await this.audit.log({ userId: actor.id, tenantId: id, action: 'platform.tenant_updated', entity: 'Tenant', entityId: id, data: { ...dto } });
    return this.get(id);
  }

  async resetUserPassword(tenantId: string, userId: string, password: string, actor: AuthUser) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(password), failedLoginAttempts: 0, lockedUntil: null, isActive: true },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ userId: actor.id, tenantId, action: 'platform.user_password_reset', entity: 'User', entityId: userId });
  }

  private cleanModules(modules: string[]): string[] {
    const invalid = modules.filter((m) => !isValidModule(m));
    if (invalid.length) throw new BadRequestException(`Módulos inválidos: ${invalid.join(', ')}`);
    const set = new Set<string>([...CORE_MODULES, ...modules]);
    // Compras y traslados dependen de inventario.
    for (const m of MODULE_CATALOG) {
      if (set.has(m.key) && m.dependsOn?.some((d) => !set.has(d))) {
        throw new BadRequestException(`"${m.label}" requiere activar: ${m.dependsOn.map((d) => MODULE_CATALOG.find((x) => x.key === d)?.label).join(', ')}`);
      }
    }
    return MODULE_CATALOG.map((m) => m.key).filter((k) => set.has(k));
  }
}
