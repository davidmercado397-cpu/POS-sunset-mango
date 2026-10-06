import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { AuthUser } from '../common/auth-user';
import { CORE_MODULES, MODULE_CATALOG } from '../common/modules';
import { isValidPermission, PERMISSION_CATALOG } from '../common/permissions';
import { tenantOf } from '../common/util';
import { encryptSecret } from '../common/secret-box';
import { BoldService } from '../payments/bold.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { BoldSettingsDto, BranchDto, BrandingDto, CreateUserDto, NamedDto, RoleDto, TableDto, UpdateUserDto } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly bold: BoldService,
  ) {}

  // ───────── Sedes ─────────

  async branches(user: AuthUser) {
    const tenantId = tenantOf(user);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return {
      availableModules: MODULE_CATALOG.filter((m) => m.core || tenant.enabledModules.includes(m.key)),
      branches: branches.map(({ _count, ...b }) => ({ ...b, users: _count.users })),
    };
  }

  async createBranch(user: AuthUser, dto: BranchDto) {
    const tenantId = tenantOf(user);
    const modules = await this.validModules(tenantId, dto.activeModules ?? user.tenantModules);
    const branch = await this.prisma.branch.create({
      data: { tenantId, name: dto.name.trim(), address: dto.address, phone: dto.phone, isActive: dto.isActive ?? true, activeModules: modules },
    });
    await this.audit.log({ tenantId, userId: user.id, action: 'branch.created', entity: 'Branch', entityId: branch.id, data: { name: branch.name } });
    return branch;
  }

  async updateBranch(user: AuthUser, id: string, dto: BranchDto) {
    const tenantId = tenantOf(user);
    const branch = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException('Sede no encontrada');
    const modules = dto.activeModules ? await this.validModules(tenantId, dto.activeModules) : undefined;
    if (dto.isActive === false && branch.isActive) {
      const open = await this.prisma.cashSession.count({ where: { branchId: id, status: 'OPEN' } });
      if (open) throw new BadRequestException('Cierra la caja de la sede antes de desactivarla');
    }
    const updated = await this.prisma.branch.update({
      where: { id },
      data: { name: dto.name.trim(), address: dto.address, phone: dto.phone, isActive: dto.isActive, activeModules: modules },
    });
    await this.audit.log({ tenantId, userId: user.id, action: 'branch.updated', entity: 'Branch', entityId: id, data: { ...dto } });
    return updated;
  }

  private async validModules(tenantId: string, modules: string[]): Promise<string[]> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const notAllowed = modules.filter((m) => !CORE_MODULES.includes(m as never) && !tenant.enabledModules.includes(m));
    if (notAllowed.length) throw new BadRequestException('Hay módulos que no están habilitados para el negocio');
    const set = new Set([...CORE_MODULES, ...modules]);
    for (const m of MODULE_CATALOG) {
      if (set.has(m.key) && m.dependsOn?.some((d) => !set.has(d))) {
        throw new BadRequestException(`"${m.label}" requiere activar Inventario`);
      }
    }
    return MODULE_CATALOG.map((m) => m.key).filter((k) => set.has(k));
  }

  // ───────── Usuarios ─────────

  async users(user: AuthUser) {
    const users = await this.prisma.user.findMany({
      where: { tenantId: tenantOf(user) },
      include: { role: true, branches: true },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      email: u.email,
      isActive: u.isActive,
      role: u.role ? { id: u.role.id, name: u.role.name } : null,
      branchIds: u.branches.map((b) => b.branchId),
      lastLoginAt: u.lastLoginAt,
      lockedUntil: u.lockedUntil,
    }));
  }

  async createUser(user: AuthUser, dto: CreateUserDto) {
    const tenantId = tenantOf(user);
    const username = dto.username.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username } })) {
      throw new ConflictException(`El usuario "${username}" ya existe`);
    }
    await this.assertRole(tenantId, dto.roleId);
    await this.assertBranches(tenantId, dto.branchIds);
    const created = await this.prisma.user.create({
      data: {
        tenantId,
        username,
        fullName: dto.fullName.trim(),
        email: dto.email || (username.includes('@') ? username : undefined),
        roleId: dto.roleId,
        passwordHash: await hashPassword(dto.password),
        branches: { create: dto.branchIds.map((branchId) => ({ branchId })) },
      },
    });
    await this.audit.log({ tenantId, userId: user.id, action: 'user.created', entity: 'User', entityId: created.id, data: { username } });
    return { id: created.id };
  }

  async updateUser(user: AuthUser, id: string, dto: UpdateUserDto) {
    const tenantId = tenantOf(user);
    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    if (id === user.id && (dto.isActive === false || (dto.roleId && dto.roleId !== target.roleId))) {
      throw new BadRequestException('No puedes desactivarte ni cambiar tu propio rol');
    }
    if (dto.roleId) await this.assertRole(tenantId, dto.roleId);
    if (dto.branchIds) await this.assertBranches(tenantId, dto.branchIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { fullName: dto.fullName?.trim(), email: dto.email, roleId: dto.roleId, isActive: dto.isActive },
      });
      if (dto.branchIds) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        await tx.userBranch.createMany({ data: dto.branchIds.map((branchId) => ({ userId: id, branchId })) });
      }
      if (dto.isActive === false) {
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    });
    await this.audit.log({ tenantId, userId: user.id, action: 'user.updated', entity: 'User', entityId: id, data: { ...dto } });
    return { id };
  }

  async resetPassword(user: AuthUser, id: string, password: string) {
    const tenantId = tenantOf(user);
    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(password), failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ tenantId, userId: user.id, action: 'user.password_reset', entity: 'User', entityId: id });
  }

  private async assertRole(tenantId: string, roleId: string) {
    if (!(await this.prisma.role.findFirst({ where: { id: roleId, tenantId } }))) throw new BadRequestException('Rol inválido');
  }

  private async assertBranches(tenantId: string, ids: string[]) {
    const count = await this.prisma.branch.count({ where: { id: { in: ids }, tenantId } });
    if (count !== ids.length) throw new BadRequestException('Sede inválida');
  }

  // ───────── Roles ─────────

  async roles(user: AuthUser) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: tenantOf(user) },
      include: { _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return {
      // Solo se ofrecen los permisos de módulos habilitados para el negocio.
      catalog: PERMISSION_CATALOG.filter((p) => {
        const mod = (p as { module?: string }).module;
        return !mod || CORE_MODULES.includes(mod as never) || user.tenantModules.includes(mod);
      }),
      roles: roles.map(({ _count, ...r }) => ({ ...r, users: _count.users })),
    };
  }

  async saveRole(user: AuthUser, dto: RoleDto, id?: string) {
    const tenantId = tenantOf(user);
    const permissions = dto.permissions.filter(isValidPermission);
    try {
      const role = id
        ? await this.prisma.role.update({
            where: { id, tenantId },
            data: { name: dto.name.trim(), description: dto.description, permissions },
          })
        : await this.prisma.role.create({ data: { tenantId, name: dto.name.trim(), description: dto.description, permissions } });
      await this.audit.log({ tenantId, userId: user.id, action: id ? 'role.updated' : 'role.created', entity: 'Role', entityId: role.id, data: { name: role.name, permissions } });
      return role;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Ya existe un rol con ese nombre');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new NotFoundException('Rol no encontrado');
      throw err;
    }
  }

  async deleteRole(user: AuthUser, id: string) {
    const tenantId = tenantOf(user);
    const role = await this.prisma.role.findFirst({ where: { id, tenantId }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.isSystem) throw new BadRequestException('Los roles base no se pueden eliminar');
    if (role._count.users) throw new BadRequestException('El rol tiene usuarios asignados');
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ tenantId, userId: user.id, action: 'role.deleted', entity: 'Role', entityId: id, data: { name: role.name } });
  }

  // ───────── Marca ─────────

  async branding(user: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantOf(user) } });
    return { name: t.name, brandName: t.brandName ?? t.name, logoUrl: t.logoUrl, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor };
  }

  async updateBranding(user: AuthUser, dto: BrandingDto) {
    const tenantId = tenantOf(user);
    await this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
    await this.audit.log({ tenantId, userId: user.id, action: 'settings.branding', data: { ...dto } });
    return this.branding(user);
  }

  async uploadLogo(user: AuthUser, file: Express.Multer.File | undefined) {
    const tenantId = tenantOf(user);
    const current = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const url = await this.uploads.saveImage(tenantId, file, 256);
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: url } });
    await this.uploads.remove(tenantId, current.logoUrl);
    return this.branding(user);
  }

  async removeLogo(user: AuthUser) {
    const tenantId = tenantOf(user);
    const current = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: null } });
    await this.uploads.remove(tenantId, current.logoUrl);
    return this.branding(user);
  }

  // ───────── Pagos en línea (Bold) ─────────

  async boldSettings(user: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantOf(user) } });
    return {
      enabled: t.boldEnabled,
      identityKey: t.boldIdentityKey ?? '',
      hasSecretKey: !!t.boldSecretKeyEnc,
      integrationReady: this.bold.integrationReady,
      active: this.bold.isReady(t),
    };
  }

  async updateBoldSettings(user: AuthUser, dto: BoldSettingsDto) {
    const tenantId = tenantOf(user);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        boldEnabled: dto.enabled,
        boldIdentityKey: dto.identityKey?.trim() || null,
        ...(dto.secretKey?.trim() ? { boldSecretKeyEnc: encryptSecret(dto.secretKey.trim()) } : {}),
      },
    });
    // Nunca se registra la llave secreta en la auditoría.
    await this.audit.log({ tenantId, userId: user.id, action: 'settings.bold', data: { enabled: dto.enabled, secretChanged: !!dto.secretKey?.trim() } });
    return this.boldSettings(user);
  }

  // ───────── Categorías de gastos ─────────

  expenseCategories(user: AuthUser) {
    return this.prisma.expenseCategory.findMany({ where: { tenantId: tenantOf(user) }, orderBy: { name: 'asc' } });
  }

  async saveExpenseCategory(user: AuthUser, dto: NamedDto, id?: string) {
    const tenantId = tenantOf(user);
    try {
      return id
        ? await this.prisma.expenseCategory.update({ where: { id, tenantId }, data: { name: dto.name.trim(), isActive: dto.isActive } })
        : await this.prisma.expenseCategory.create({ data: { tenantId, name: dto.name.trim() } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Ya existe esa categoría');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new NotFoundException('Categoría no encontrada');
      throw err;
    }
  }

  // ───────── Mesas ─────────

  async tables(user: AuthUser, branchId: string) {
    const tenantId = tenantOf(user);
    return this.prisma.diningTable.findMany({ where: { tenantId, branchId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async saveTable(user: AuthUser, branchId: string, dto: TableDto, id?: string) {
    const tenantId = tenantOf(user);
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new NotFoundException('Sede no encontrada');
    try {
      return id
        ? await this.prisma.diningTable.update({ where: { id, branchId }, data: { ...dto, name: dto.name.trim() } })
        : await this.prisma.diningTable.create({ data: { ...dto, name: dto.name.trim(), tenantId, branchId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Ya existe una mesa con ese nombre');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new NotFoundException('Mesa no encontrada');
      throw err;
    }
  }

  // ───────── Auditoría ─────────

  async auditLog(user: AuthUser, page = 1) {
    const tenantId = tenantOf(user);
    const take = 50;
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take, skip: (page - 1) * take }),
      this.prisma.auditLog.count({ where: { tenantId } }),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      total,
      page,
      pages: Math.max(1, Math.ceil(total / take)),
      rows: rows.map((r) => ({ ...r, userName: r.userId ? (names.get(r.userId) ?? '—') : 'Sistema' })),
    };
  }
}
