import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashService } from '../cash/cash.service';
import { AuthUser, BranchContext } from '../common/auth-user';
import { dayRange, num, round3, tenantOf } from '../common/util';
import { StockService } from '../inventory/stock.service';
import { KitchenService, KitchenTicketItem } from '../kitchen/kitchen.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddItemsDto, CreateSaleDto, OpenOrderDto, PayDto, SaleItemDto } from './sales.dto';

type Tx = Prisma.TransactionClient;

export interface PricedLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  notes: string | null;
  sendToKitchen: boolean;
  modifiers: { optionId: string; groupName: string; optionName: string; priceDelta: number }[];
  /** Consumo de inventario por la línea completa (cantidad incluida) */
  consumption: Map<string, number>;
}

const SALE_DETAIL = {
  items: { orderBy: { createdAt: 'asc' }, include: { modifiers: true } },
  payments: true,
  table: { select: { id: true, name: true } },
  createdBy: { select: { fullName: true } },
  voidedBy: { select: { fullName: true } },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly kitchen: KitchenService,
    private readonly cash: CashService,
  ) {}

  // ───────── Menú del POS ─────────

  async menu(user: AuthUser, branch: BranchContext) {
    const tenantId = tenantOf(user);
    const [categories, products, session, tables] = await Promise.all([
      this.prisma.category.findMany({ where: { tenantId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true, NOT: { disabledBranchIds: { has: branch.id } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          modifierGroups: {
            orderBy: { sortOrder: 'asc' },
            include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
          },
        },
      }),
      this.prisma.cashSession.findFirst({ where: { branchId: branch.id, status: 'OPEN' }, select: { id: true, openedAt: true } }),
      branch.modules.includes('tables')
        ? this.prisma.diningTable.findMany({ where: { branchId: branch.id, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
        : Promise.resolve([]),
    ]);
    return {
      cashSession: session,
      modules: branch.modules,
      categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      tables: tables.map((t) => ({ id: t.id, name: t.name, area: t.area })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        imageUrl: p.imageUrl,
        categoryId: p.categoryId,
        modifierGroups: p.modifierGroups
          .filter((g) => g.options.length > 0)
          .map((g) => ({
            id: g.id,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta })),
          })),
      })),
    };
  }

  // ───────── Venta directa ─────────

  async create(user: AuthUser, branch: BranchContext, dto: CreateSaleDto) {
    const tenantId = tenantOf(user);
    const session = await this.cash.openSession(branch.id);
    const saleId = await this.prisma.$transaction(async (tx) => {
      await this.cash.lockOpen(tx, session.id);
      const lines = await this.priceItems(tx, tenantId, branch, dto.items);
      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      const pay = this.validatePayments(branch, subtotal, dto);
      const number = await this.nextNumber(tx, branch.id);
      const sale = await tx.sale.create({
        data: {
          tenantId,
          branchId: branch.id,
          cashSessionId: session.id,
          number,
          status: 'COMPLETED',
          customerName: dto.customerName?.trim() || null,
          notes: dto.notes?.trim() || null,
          subtotal,
          tipAmount: pay.tipAmount,
          tipMethod: pay.tipMethod,
          createdById: user.id,
          completedAt: new Date(),
          payments: { create: pay.payments },
        },
      });
      await this.createItems(tx, sale.id, lines, true);
      await this.consumeInventory(tx, user, branch, sale.id, lines);
      await this.sendToKitchen(tx, tenantId, branch, sale.id, `Venta #${number}${sale.customerName ? ` · ${sale.customerName}` : ''}`, lines);
      return sale.id;
    });
    this.kitchen.notify(branch.id);
    return this.detail(user, branch, saleId);
  }

  // ───────── Cuentas abiertas (mesas) ─────────

  async openOrders(user: AuthUser, branch: BranchContext) {
    const orders = await this.prisma.sale.findMany({
      where: { tenantId: tenantOf(user), branchId: branch.id, status: 'OPEN' },
      include: SALE_DETAIL,
      orderBy: { createdAt: 'asc' },
    });
    return orders;
  }

  async openOrder(user: AuthUser, branch: BranchContext, dto: OpenOrderDto) {
    const tenantId = tenantOf(user);
    await this.cash.openSession(branch.id);
    let table: { id: string; name: string } | null = null;
    if (dto.tableId) {
      table = await this.prisma.diningTable.findFirst({ where: { id: dto.tableId, branchId: branch.id, isActive: true } });
      if (!table) throw new BadRequestException('Mesa no encontrada');
    }
    if (!table && !dto.customerName?.trim()) throw new BadRequestException('Elige una mesa o escribe el nombre del cliente');

    let saleId: string;
    try {
      saleId = await this.prisma.$transaction(async (tx) => {
        const lines = await this.priceItems(tx, tenantId, branch, dto.items);
        const number = await this.nextNumber(tx, branch.id);
        const sale = await tx.sale.create({
          data: {
            tenantId,
            branchId: branch.id,
            number,
            status: 'OPEN',
            tableId: table?.id,
            customerName: dto.customerName?.trim() || null,
            notes: dto.notes?.trim() || null,
            subtotal: lines.reduce((s, l) => s + l.lineTotal, 0),
            createdById: user.id,
          },
        });
        await this.createItems(tx, sale.id, lines, true);
        await this.sendToKitchen(tx, tenantId, branch, sale.id, this.orderLabel(number, table?.name, sale.customerName), lines);
        return sale.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('La mesa ya tiene una cuenta abierta');
      }
      throw err;
    }
    this.kitchen.notify(branch.id);
    return this.detail(user, branch, saleId);
  }

  async addItems(user: AuthUser, branch: BranchContext, id: string, dto: AddItemsDto) {
    const tenantId = tenantOf(user);
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.lockOpenOrder(tx, branch.id, id);
      const lines = await this.priceItems(tx, tenantId, branch, dto.items);
      await this.createItems(tx, sale.id, lines, true);
      await tx.sale.update({ where: { id: sale.id }, data: { subtotal: { increment: lines.reduce((s, l) => s + l.lineTotal, 0) } } });
      const table = sale.tableId ? await tx.diningTable.findUnique({ where: { id: sale.tableId } }) : null;
      await this.sendToKitchen(tx, tenantId, branch, sale.id, this.orderLabel(sale.number, table?.name, sale.customerName), lines);
    });
    this.kitchen.notify(branch.id);
    return this.detail(user, branch, id);
  }

  async removeItem(user: AuthUser, branch: BranchContext, id: string, itemId: string) {
    const tenantId = tenantOf(user);
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.lockOpenOrder(tx, branch.id, id);
      const item = await tx.saleItem.findFirst({ where: { id: itemId, saleId: sale.id } });
      if (!item) throw new NotFoundException('Ítem no encontrado');
      await tx.saleItem.delete({ where: { id: item.id } });
      await tx.sale.update({ where: { id: sale.id }, data: { subtotal: { decrement: item.lineTotal } } });
      await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'order.item_removed', entity: 'Sale', entityId: sale.id, data: { product: item.productName, quantity: item.quantity } });
    });
    this.kitchen.notify(branch.id);
    return this.detail(user, branch, id);
  }

  async payOrder(user: AuthUser, branch: BranchContext, id: string, dto: PayDto) {
    const session = await this.cash.openSession(branch.id);
    await this.prisma.$transaction(async (tx) => {
      await this.cash.lockOpen(tx, session.id);
      const sale = await this.lockOpenOrder(tx, branch.id, id);
      const items = await tx.saleItem.findMany({ where: { saleId: sale.id }, include: { modifiers: true } });
      if (!items.length) throw new BadRequestException('La cuenta no tiene productos');
      const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
      const pay = this.validatePayments(branch, subtotal, dto);
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'COMPLETED',
          cashSessionId: session.id,
          subtotal,
          tipAmount: pay.tipAmount,
          tipMethod: pay.tipMethod,
          completedAt: new Date(),
          payments: { create: pay.payments },
        },
      });
      // El inventario de las cuentas abiertas se descuenta al cobrar, con las recetas vigentes.
      const lines = await this.consumptionFromItems(tx, items);
      await this.consumeInventory(tx, user, branch, sale.id, lines);
    });
    this.kitchen.notify(branch.id);
    return this.detail(user, branch, id);
  }

  async cancelOrder(user: AuthUser, branch: BranchContext, id: string, reason: string) {
    const tenantId = tenantOf(user);
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.lockOpenOrder(tx, branch.id, id);
      await tx.sale.update({ where: { id: sale.id }, data: { status: 'VOIDED', voidedAt: new Date(), voidedById: user.id, voidReason: reason.trim() } });
      await tx.kitchenTicket.updateMany({ where: { saleId: sale.id, status: { in: ['PENDING', 'PREPARING'] } }, data: { status: 'CANCELLED' } });
    });
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'sale.voided', entity: 'Sale', entityId: id, data: { reason, open: true } });
    this.kitchen.notify(branch.id);
    return this.detail(user, branch, id);
  }

  // ───────── Consulta y anulación ─────────

  async list(user: AuthUser, branch: BranchContext, from?: string, to?: string, status?: string) {
    const where: Prisma.SaleWhereInput = { tenantId: tenantOf(user), branchId: branch.id, createdAt: dayRange(from, to) };
    if (status === 'COMPLETED' || status === 'VOIDED' || status === 'OPEN') where.status = status;
    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { payments: true, table: { select: { name: true } }, createdBy: { select: { fullName: true } }, _count: { select: { items: true } } },
    });
    return sales;
  }

  async detail(user: AuthUser, branch: BranchContext, id: string) {
    const sale = await this.prisma.sale.findFirst({ where: { id, tenantId: tenantOf(user), branchId: branch.id }, include: SALE_DETAIL });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  async void(user: AuthUser, branch: BranchContext, id: string, reason: string) {
    const tenantId = tenantOf(user);
    await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id, tenantId, branchId: branch.id }, include: { cashSession: true } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === 'OPEN') throw new BadRequestException('Para cuentas abiertas usa "Anular cuenta"');
      if (sale.status === 'VOIDED') throw new BadRequestException('La venta ya está anulada');
      if (sale.cashSession?.status !== 'OPEN') {
        throw new BadRequestException('La caja de esta venta ya fue cerrada; no se puede anular');
      }
      await this.cash.lockOpen(tx, sale.cashSession.id);
      const { count } = await tx.sale.updateMany({
        where: { id, status: 'COMPLETED' },
        data: { status: 'VOIDED', voidedAt: new Date(), voidedById: user.id, voidReason: reason.trim() },
      });
      if (!count) throw new ConflictException('La venta ya fue anulada');

      // Devuelve al inventario exactamente lo que se descontó.
      const movements = await tx.stockMovement.findMany({ where: { refType: 'Sale', refId: id, type: 'SALE' } });
      if (movements.length) {
        await this.stock.apply(tx, {
          tenantId,
          branchId: branch.id,
          userId: user.id,
          type: 'VOID',
          refType: 'Sale',
          refId: id,
          note: `Anulación venta #${sale.number}`,
          lines: movements.map((m) => ({ itemId: m.itemId, quantity: -num(m.quantity), unitCost: num(m.unitCost) })),
        });
      }
      await tx.kitchenTicket.updateMany({ where: { saleId: id, status: { in: ['PENDING', 'PREPARING', 'READY'] } }, data: { status: 'CANCELLED' } });
    });
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'sale.voided', entity: 'Sale', entityId: id, data: { reason } });
    this.kitchen.notify(branch.id);
    return this.detail(user, branch, id);
  }

  /**
   * Cobra un pedido en línea: crea la venta con los ítems y precios que vio el cliente,
   * agrega el domicilio como línea aparte y descuenta el inventario.
   */
  async completeOnlineOrder(user: AuthUser, branch: BranchContext, orderId: string, dto: PayDto) {
    const tenantId = tenantOf(user);
    const session = await this.cash.openSession(branch.id);
    const saleId = await this.prisma.$transaction(async (tx) => {
      await this.cash.lockOpen(tx, session.id);
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "OnlineOrder" WHERE id = ${orderId} AND "branchId" = ${branch.id} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Pedido no encontrado');
      const order = await tx.onlineOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(order.status)) throw new BadRequestException('El pedido ya fue cerrado');

      const snapshot = order.items as unknown as Omit<PricedLine, 'consumption' | 'sendToKitchen'>[];
      const pay = this.validatePayments(branch, order.total, dto);
      const number = await this.nextNumber(tx, branch.id);
      const sale = await tx.sale.create({
        data: {
          tenantId,
          branchId: branch.id,
          cashSessionId: session.id,
          number,
          status: 'COMPLETED',
          customerName: `${order.customerName} (${order.type === 'DELIVERY' ? 'domicilio' : 'para recoger'})`,
          notes: [`Pedido en línea ${order.code}`, order.phone, order.address].filter(Boolean).join(' · '),
          subtotal: order.total,
          tipAmount: pay.tipAmount,
          tipMethod: pay.tipMethod,
          createdById: user.id,
          completedAt: new Date(),
          payments: { create: pay.payments },
        },
      });
      const lines = snapshot.map((l) => ({ ...l, sendToKitchen: false, consumption: new Map<string, number>() }));
      if (order.deliveryFee > 0) {
        lines.push({ productId: null as unknown as string, productName: 'Domicilio', unitPrice: order.deliveryFee, quantity: 1, lineTotal: order.deliveryFee, notes: null, modifiers: [], sendToKitchen: false, consumption: new Map() });
      }
      await this.createItems(tx, sale.id, lines, true);
      const items = await tx.saleItem.findMany({ where: { saleId: sale.id, productId: { not: null } }, include: { modifiers: true } });
      await this.consumeInventory(tx, user, branch, sale.id, await this.consumptionFromItems(tx, items));
      await tx.onlineOrder.update({ where: { id: orderId }, data: { status: 'COMPLETED', saleId: sale.id } });
      await tx.kitchenTicket.updateMany({ where: { onlineOrderId: orderId, status: { in: ['PENDING', 'PREPARING', 'READY'] } }, data: { status: 'DELIVERED' } });
      return sale.id;
    });
    this.kitchen.notify(branch.id);
    return this.detail(user, branch, saleId);
  }

  assertCanRemoveItems(user: AuthUser) {
    if (!user.permissions.includes('sales.void')) {
      throw new ForbiddenException('Solo el administrador de la sede puede quitar productos ya enviados');
    }
  }

  // ───────── Internos ─────────

  /** Valida productos, variantes y calcula precios en el servidor (nunca se confía en el cliente). */
  async priceItems(tx: Tx, tenantId: string, branch: BranchContext, items: SaleItemDto[]): Promise<PricedLine[]> {
    const ids = [...new Set(items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: ids }, tenantId, isActive: true, NOT: { disabledBranchIds: { has: branch.id } } },
      include: {
        recipe: true,
        modifierGroups: { include: { options: { where: { isActive: true }, include: { recipe: true } } } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const useInventory = branch.modules.includes('inventory');

    return items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException('Un producto ya no está disponible. Actualiza el menú');
      const chosen = [...new Set(item.optionIds ?? [])];
      const modifiers: PricedLine['modifiers'] = [];
      const consumption = new Map<string, number>();
      const add = (lines: { inventoryItemId: string; quantity: Prisma.Decimal }[]) => {
        if (!useInventory) return;
        for (const l of lines) consumption.set(l.inventoryItemId, round3((consumption.get(l.inventoryItemId) ?? 0) + num(l.quantity) * item.quantity));
      };
      add(product.recipe);

      let matched = 0;
      for (const group of product.modifierGroups) {
        const selected = group.options.filter((o) => chosen.includes(o.id));
        matched += selected.length;
        if (group.options.length && (selected.length < group.minSelect || selected.length > group.maxSelect)) {
          throw new BadRequestException(`"${product.name}": en "${group.name}" elige ${group.minSelect === group.maxSelect ? group.minSelect : `entre ${group.minSelect} y ${group.maxSelect}`}`);
        }
        for (const o of selected) {
          modifiers.push({ optionId: o.id, groupName: group.name, optionName: o.name, priceDelta: o.priceDelta });
          add(o.recipe);
        }
      }
      if (matched !== chosen.length) throw new BadRequestException(`"${product.name}" tiene opciones inválidas`);

      const unitPrice = product.price + modifiers.reduce((s, m) => s + m.priceDelta, 0);
      if (unitPrice < 0) throw new BadRequestException(`"${product.name}" quedó con precio negativo`);
      return {
        productId: product.id,
        productName: product.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
        notes: item.notes?.trim() || null,
        sendToKitchen: product.sendToKitchen,
        modifiers,
        consumption,
      };
    });
  }

  /** Recalcula el consumo de inventario de ítems ya guardados (cuentas abiertas). */
  private async consumptionFromItems(tx: Tx, items: Prisma.SaleItemGetPayload<{ include: { modifiers: true } }>[]): Promise<PricedLine[]> {
    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
    const optionIds = [...new Set(items.flatMap((i) => i.modifiers.map((m) => m.optionId)).filter(Boolean))] as string[];
    const [productRecipes, optionRecipes] = await Promise.all([
      tx.recipeLine.findMany({ where: { productId: { in: productIds } } }),
      tx.recipeLine.findMany({ where: { modifierOptionId: { in: optionIds } } }),
    ]);
    return items.map((i) => {
      const consumption = new Map<string, number>();
      const lines = [
        ...productRecipes.filter((r) => r.productId === i.productId),
        ...optionRecipes.filter((r) => i.modifiers.some((m) => m.optionId === r.modifierOptionId)),
      ];
      for (const l of lines) consumption.set(l.inventoryItemId, round3((consumption.get(l.inventoryItemId) ?? 0) + num(l.quantity) * i.quantity));
      return { ...i, productId: i.productId ?? '', sendToKitchen: false, modifiers: [], consumption } as PricedLine;
    });
  }

  private validatePayments(branch: BranchContext, subtotal: number, dto: PayDto) {
    const tipAmount = dto.tipAmount ?? 0;
    if (tipAmount > 0 && !branch.modules.includes('tips')) throw new BadRequestException('Las propinas no están activas en esta sede');
    const total = subtotal + tipAmount;
    const paid = dto.payments.reduce((s, p) => s + p.amount, 0);
    if (paid !== total) {
      throw new BadRequestException(`Los pagos (${paid.toLocaleString('es-CO')}) no coinciden con el total (${total.toLocaleString('es-CO')})`);
    }
    const methods = dto.payments.map((p) => p.method);
    let tipMethod: PaymentMethod | null = null;
    if (tipAmount > 0) {
      tipMethod = dto.tipMethod ?? methods[0];
      if (!methods.includes(tipMethod)) throw new BadRequestException('La propina debe pagarse con uno de los métodos usados');
    }
    const payments = dto.payments.map((p) => {
      if (p.method === 'CASH') {
        const received = p.received ?? p.amount;
        if (received < p.amount) throw new BadRequestException('El efectivo recibido es menor al valor a pagar');
        return { method: p.method, amount: p.amount, received, change: received - p.amount, reference: null };
      }
      return { method: p.method, amount: p.amount, received: null, change: null, reference: p.reference?.trim() || null };
    });
    return { tipAmount, tipMethod, payments };
  }

  private async nextNumber(tx: Tx, branchId: string): Promise<number> {
    const branch = await tx.branch.update({ where: { id: branchId }, data: { saleSeq: { increment: 1 } }, select: { saleSeq: true } });
    return branch.saleSeq;
  }

  private async createItems(tx: Tx, saleId: string, lines: PricedLine[], sent: boolean) {
    for (const l of lines) {
      await tx.saleItem.create({
        data: {
          saleId,
          productId: l.productId,
          productName: l.productName,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
          notes: l.notes,
          sentAt: sent ? new Date() : null,
          modifiers: { create: l.modifiers },
        },
      });
    }
  }

  private async consumeInventory(tx: Tx, user: AuthUser, branch: BranchContext, saleId: string, lines: PricedLine[]) {
    if (!branch.modules.includes('inventory')) return;
    const total = new Map<string, number>();
    for (const l of lines) for (const [itemId, q] of l.consumption) total.set(itemId, round3((total.get(itemId) ?? 0) + q));
    if (!total.size) return;
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, select: { number: true } });
    await this.stock.apply(tx, {
      tenantId: tenantOf(user),
      branchId: branch.id,
      userId: user.id,
      type: 'SALE',
      refType: 'Sale',
      refId: saleId,
      note: `Venta #${sale.number}`,
      lines: [...total].map(([itemId, q]) => ({ itemId, quantity: -q })),
    });
  }

  private async sendToKitchen(tx: Tx, tenantId: string, branch: BranchContext, saleId: string, label: string, lines: PricedLine[]) {
    if (!branch.modules.includes('kitchen')) return;
    const items: KitchenTicketItem[] = lines
      .filter((l) => l.sendToKitchen)
      .map((l) => ({ name: l.productName, quantity: l.quantity, modifiers: l.modifiers.map((m) => m.optionName), notes: l.notes }));
    if (!items.length) return;
    await this.kitchen.createTicket(tx, { tenantId, branchId: branch.id, saleId, label, items });
  }

  private async lockOpenOrder(tx: Tx, branchId: string, id: string) {
    // Bloquea la fila para evitar dos cobros simultáneos de la misma cuenta.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Sale" WHERE id = ${id} AND "branchId" = ${branchId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Cuenta no encontrada');
    const sale = await tx.sale.findUniqueOrThrow({ where: { id } });
    if (sale.status !== 'OPEN') throw new BadRequestException('La cuenta ya no está abierta');
    return sale;
  }

  private orderLabel(number: number, tableName?: string | null, customer?: string | null) {
    return [tableName, customer, `#${number}`].filter(Boolean).join(' · ');
  }
}
