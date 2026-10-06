import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Branch, OnlineOrder, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser, BranchContext } from '../common/auth-user';
import { effectiveModules } from '../common/modules';
import { dayRange, tenantOf } from '../common/util';
import { KitchenService } from '../kitchen/kitchen.service';
import { BoldService } from '../payments/bold.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayDto } from '../sales/sales.dto';
import { SalesService } from '../sales/sales.service';
import { OnlineSettingsDto, PublicOrderDto } from './online.dto';

// Sin caracteres que se confunden (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ACTIVE: OnlineOrder['status'][] = ['NEW', 'ACCEPTED', 'READY', 'DISPATCHED'];

@Injectable()
export class OnlineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly kitchen: KitchenService,
    private readonly audit: AuditService,
    private readonly bold: BoldService,
  ) {}

  // ───────── Público (sin usuario) ─────────

  private async publicTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || !tenant.isActive || !tenant.enabledModules.includes('online')) throw new NotFoundException('Tienda no disponible');
    const branches = await this.prisma.branch.findMany({ where: { tenantId: tenant.id, isActive: true }, orderBy: { name: 'asc' } });
    const online = branches.filter((b) => effectiveModules(tenant.enabledModules, b.activeModules).includes('online'));
    return { tenant, branches: online };
  }

  /** La sede recibe pedidos si los tiene activados y su caja está abierta. */
  private async isOpen(branch: Branch) {
    if (!branch.onlineAccepting) return false;
    return (await this.prisma.cashSession.count({ where: { branchId: branch.id, status: 'OPEN' } })) > 0;
  }

  async store(slug: string) {
    const { tenant, branches } = await this.publicTenant(slug);
    return {
      name: tenant.brandName ?? tenant.name,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      branches: await Promise.all(
        branches.map(async (b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          open: await this.isOpen(b),
          allowDelivery: b.allowDelivery,
          allowPickup: b.allowPickup,
          deliveryFee: b.deliveryFee,
          minOrder: b.minOrder,
          message: b.onlineMessage,
          whatsapp: b.whatsapp,
          transferInfo: b.transferInfo,
        })),
      ),
      // Métodos de pago disponibles para el cliente. Bold se habilita cuando la integración esté activa.
      paymentMethods: this.bold.isReady(tenant) ? ['TRANSFER', 'QR_BOLD'] : ['TRANSFER'],
    };
  }

  async menu(slug: string, branchId: string) {
    const { tenant, branches } = await this.publicTenant(slug);
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) throw new NotFoundException('Sede no disponible');
    const ctx: BranchContext = { id: branch.id, name: branch.name, modules: effectiveModules(tenant.enabledModules, branch.activeModules) };
    const menu = await this.sales.menu({ tenantId: tenant.id } as AuthUser, ctx);
    return { categories: menu.categories, products: menu.products };
  }

  async placeOrder(slug: string, dto: PublicOrderDto, ip?: string) {
    if (dto.website) throw new BadRequestException('Solicitud inválida');
    const { tenant, branches } = await this.publicTenant(slug);
    const branch = branches.find((b) => b.id === dto.branchId);
    if (!branch) throw new NotFoundException('Sede no disponible');
    if (!(await this.isOpen(branch))) throw new BadRequestException('En este momento no estamos recibiendo pedidos');
    if (dto.type === 'DELIVERY' && !branch.allowDelivery) throw new BadRequestException('Esta sede no tiene domicilios');
    if (dto.type === 'PICKUP' && !branch.allowPickup) throw new BadRequestException('Esta sede no tiene pedidos para recoger');
    if (dto.type === 'DELIVERY' && (dto.address?.trim().length ?? 0) < 5) throw new BadRequestException('Escribe la dirección de entrega');
    const allowedPayments = this.bold.isReady(tenant) ? ['TRANSFER', 'QR_BOLD'] : ['TRANSFER'];
    if (!allowedPayments.includes(dto.paymentMethod)) throw new BadRequestException('Método de pago no disponible');

    // Evita abusos: máximo 3 pedidos activos por teléfono en la sede.
    const phone = dto.phone.replace(/\D/g, '');
    const active = await this.prisma.onlineOrder.count({ where: { branchId: branch.id, phone, status: { in: ACTIVE } } });
    if (active >= 3) throw new BadRequestException('Ya tienes pedidos en curso. Espera a que lleguen o comunícate con nosotros');

    const ctx: BranchContext = { id: branch.id, name: branch.name, modules: effectiveModules(tenant.enabledModules, branch.activeModules) };
    const order = await this.prisma.$transaction(async (tx) => {
      const lines = await this.sales.priceItems(tx, tenant.id, ctx, dto.items);
      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      if (subtotal < branch.minOrder) throw new BadRequestException(`El pedido mínimo es de $${branch.minOrder.toLocaleString('es-CO')}`);
      const deliveryFee = dto.type === 'DELIVERY' ? branch.deliveryFee : 0;
      const total = subtotal + deliveryFee;

      const order = await tx.onlineOrder.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          code: await this.uniqueCode(tx),
          type: dto.type,
          customerName: dto.customerName.trim(),
          phone,
          address: dto.type === 'DELIVERY' ? dto.address?.trim() : null,
          addressNotes: dto.type === 'DELIVERY' ? dto.addressNotes?.trim() || null : null,
          notes: dto.notes?.trim() || null,
          paymentMethod: dto.paymentMethod,
          payWith: null,
          items: lines.map(({ consumption: _c, sendToKitchen: _k, ...l }) => l) as unknown as Prisma.InputJsonValue,
          subtotal,
          deliveryFee,
          total,
          ip,
        },
      });
      return order;
    });
    this.kitchen.notify(branch.id);
    return { code: order.code, total: order.total };
  }

  async track(code: string) {
    const order = await this.prisma.onlineOrder.findUnique({ where: { code: code.toUpperCase() }, include: { branch: true } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return {
      code: order.code,
      status: order.status,
      type: order.type,
      customerName: order.customerName.split(' ')[0],
      items: order.items,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      rejectReason: order.rejectReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      branch: { name: order.branch.name, address: order.branch.address, whatsapp: order.branch.whatsapp, transferInfo: order.branch.transferInfo },
    };
  }

  private async uniqueCode(tx: Prisma.TransactionClient) {
    for (let i = 0; i < 10; i++) {
      const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (!(await tx.onlineOrder.findUnique({ where: { code } }))) return code;
    }
    throw new Error('No se pudo generar el código del pedido');
  }

  // ───────── Personal del negocio ─────────

  async list(user: AuthUser, branch: BranchContext, scope?: string, from?: string, to?: string) {
    const where: Prisma.OnlineOrderWhereInput = { tenantId: tenantOf(user), branchId: branch.id };
    if (scope === 'history') where.createdAt = dayRange(from, to);
    else where.status = { in: ACTIVE };
    return this.prisma.onlineOrder.findMany({ where, orderBy: { createdAt: scope === 'history' ? 'desc' : 'asc' }, take: 300 });
  }

  async setStatus(user: AuthUser, branch: BranchContext, id: string, status: 'ACCEPTED' | 'READY' | 'DISPATCHED') {
    const order = await this.find(branch, id);
    // Un pedido nuevo debe aceptarse primero; solo entonces pasa a cocina.
    const allowed: Record<string, OnlineOrder['status'][]> = { ACCEPTED: ['NEW'], READY: ['ACCEPTED'], DISPATCHED: ['ACCEPTED', 'READY'] };
    if (!allowed[status].includes(order.status)) throw new BadRequestException('Cambio de estado no permitido');
    if (status === 'DISPATCHED' && order.type !== 'DELIVERY') throw new BadRequestException('Solo los domicilios se despachan');
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.onlineOrder.updateMany({ where: { id, status: order.status }, data: { status } });
      if (!count) throw new BadRequestException('El pedido cambió de estado; actualiza la pantalla');
      if (status === 'ACCEPTED' && branch.modules.includes('kitchen')) await this.sendToKitchen(tx, order);
      return tx.onlineOrder.findUniqueOrThrow({ where: { id } });
    });
    this.kitchen.notify(branch.id);
    return updated;
  }

  private async sendToKitchen(tx: Prisma.TransactionClient, order: OnlineOrder) {
    const lines = order.items as unknown as { productId: string; productName: string; quantity: number; notes: string | null; modifiers: { optionName: string }[] }[];
    const products = await tx.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } }, select: { id: true, sendToKitchen: true } });
    const kitchenIds = new Set(products.filter((p) => p.sendToKitchen).map((p) => p.id));
    const items = lines
      .filter((l) => kitchenIds.has(l.productId))
      .map((l) => ({ name: l.productName, quantity: l.quantity, modifiers: l.modifiers.map((m) => m.optionName), notes: l.notes }));
    if (!items.length) return;
    await this.kitchen.createTicket(tx, {
      tenantId: order.tenantId,
      branchId: order.branchId,
      onlineOrderId: order.id,
      label: [`${order.type === 'DELIVERY' ? '🛵 Domicilio' : '🛍️ Para recoger'} · ${order.customerName} · ${order.code}`, order.notes && `Nota: ${order.notes}`]
        .filter(Boolean)
        .join(' · '),
      items,
    });
  }

  /** Marca el pago (transferencia) como recibido antes de despachar. */
  async confirmPayment(user: AuthUser, branch: BranchContext, id: string, reference?: string) {
    const order = await this.find(branch, id);
    if (!ACTIVE.includes(order.status)) throw new BadRequestException('El pedido ya fue cerrado');
    await this.prisma.onlineOrder.update({ where: { id }, data: { paymentStatus: 'PAID', paymentReference: reference?.trim() || order.paymentReference } });
    await this.audit.log({ tenantId: order.tenantId, branchId: branch.id, userId: user.id, action: 'online.payment_confirmed', entity: 'OnlineOrder', entityId: id, data: { code: order.code, reference } });
    this.kitchen.notify(branch.id);
    return { id };
  }

  async close(user: AuthUser, branch: BranchContext, id: string, status: 'REJECTED' | 'CANCELLED', reason: string) {
    const order = await this.find(branch, id);
    if (!ACTIVE.includes(order.status)) throw new BadRequestException('El pedido ya fue cerrado');
    if (status === 'REJECTED' && order.status !== 'NEW') throw new BadRequestException('Solo se rechazan pedidos nuevos; usa cancelar');
    await this.prisma.$transaction([
      this.prisma.onlineOrder.update({ where: { id }, data: { status, rejectReason: reason.trim() } }),
      this.prisma.kitchenTicket.updateMany({ where: { onlineOrderId: id, status: { in: ['PENDING', 'PREPARING', 'READY'] } }, data: { status: 'CANCELLED' } }),
    ]);
    await this.audit.log({ tenantId: order.tenantId, branchId: branch.id, userId: user.id, action: `online.${status.toLowerCase()}`, entity: 'OnlineOrder', entityId: id, data: { code: order.code, reason } });
    this.kitchen.notify(branch.id);
    return { id };
  }

  pay(user: AuthUser, branch: BranchContext, id: string, dto: PayDto) {
    return this.sales.completeOnlineOrder(user, branch, id, dto);
  }

  async settings(branch: BranchContext) {
    const b = await this.prisma.branch.findUniqueOrThrow({ where: { id: branch.id }, include: { tenant: { select: { slug: true } } } });
    return {
      slug: b.tenant.slug,
      branchId: b.id,
      onlineAccepting: b.onlineAccepting,
      allowDelivery: b.allowDelivery,
      allowPickup: b.allowPickup,
      deliveryFee: b.deliveryFee,
      minOrder: b.minOrder,
      onlineMessage: b.onlineMessage,
      whatsapp: b.whatsapp,
      transferInfo: b.transferInfo,
    };
  }

  async updateSettings(user: AuthUser, branch: BranchContext, dto: OnlineSettingsDto) {
    if (!dto.allowDelivery && !dto.allowPickup) throw new BadRequestException('Activa al menos domicilio o recoger en tienda');
    await this.prisma.branch.update({
      where: { id: branch.id },
      data: {
        ...dto,
        onlineMessage: dto.onlineMessage?.trim() || null,
        whatsapp: dto.whatsapp?.replace(/\D/g, '') || null,
        transferInfo: dto.transferInfo?.trim() || null,
      },
    });
    await this.audit.log({ tenantId: tenantOf(user), branchId: branch.id, userId: user.id, action: 'online.settings', data: { ...dto } });
    return this.settings(branch);
  }

  private async find(branch: BranchContext, id: string) {
    const order = await this.prisma.onlineOrder.findFirst({ where: { id, branchId: branch.id } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }
}
