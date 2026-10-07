import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashService } from '../cash/cash.service';
import { AuthUser, BranchContext } from '../common/auth-user';
import { dayRange, num, round3, tenantOf } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustDto, EditMovementDto, InventoryItemDto, PurchaseDto, SetCostDto, SupplierDto, TransferDto } from './inventory.dto';
import { StockService } from './stock.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
    private readonly cash: CashService,
  ) {}

  // ───────── Ítems ─────────

  async items(user: AuthUser) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId: tenantOf(user) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { movements: true, recipeLines: true } } },
    });
    return items.map(({ _count, ...i }) => ({
      ...i,
      minStock: num(i.minStock),
      movementCount: _count.movements,
      recipeCount: _count.recipeLines,
    }));
  }

  /** Elimina un ítem inactivo que nunca tuvo movimientos ni se usa en recetas. */
  async deleteItem(user: AuthUser, id: string) {
    const tenantId = tenantOf(user);
    const name = await this.prisma.$transaction(async (tx) => {
      const [item] = await tx.$queryRaw<{ id: string; name: string; isActive: boolean }[]>`
        SELECT id, name, "isActive" FROM "InventoryItem" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      if (!item) throw new NotFoundException('Ítem no encontrado');
      if (item.isActive) throw new BadRequestException('Primero desactiva el ítem para poder eliminarlo');
      const [movements, purchases, transfers, recipes] = await Promise.all([
        tx.stockMovement.count({ where: { itemId: id } }),
        tx.purchaseItem.count({ where: { itemId: id } }),
        tx.transferItem.count({ where: { itemId: id } }),
        tx.recipeLine.findMany({
          where: { inventoryItemId: id },
          select: { product: { select: { name: true } }, modifierOption: { select: { name: true } } },
        }),
      ]);
      if (movements || purchases || transfers) {
        throw new BadRequestException('Este ítem ya tiene movimientos de inventario; solo se puede dejar inactivo');
      }
      if (recipes.length) {
        const names = [...new Set(recipes.map((r) => r.product?.name ?? r.modifierOption?.name ?? ''))].filter(Boolean);
        throw new BadRequestException(`Se usa en recetas de: ${names.join(', ')}. Quítalo de esas recetas primero`);
      }
      await tx.inventoryItem.delete({ where: { id } });
      return item.name;
    });
    await this.audit.log({ tenantId, userId: user.id, action: 'inventory.item_deleted', entity: 'InventoryItem', entityId: id, data: { name } });
  }

  async saveItem(user: AuthUser, dto: InventoryItemDto, id?: string) {
    const tenantId = tenantOf(user);
    try {
      const data = { name: dto.name.trim(), type: dto.type, unit: dto.unit, minStock: dto.minStock ?? 0, isActive: dto.isActive ?? true };
      const item = id
        ? await this.prisma.inventoryItem.update({ where: { id, tenantId }, data })
        : await this.prisma.inventoryItem.create({ data: { ...data, tenantId } });
      return { ...item, minStock: num(item.minStock) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Ya existe un ítem con ese nombre');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw new NotFoundException('Ítem no encontrado');
      throw err;
    }
  }

  // ───────── Existencias ─────────

  async stockList(user: AuthUser, branch: BranchContext) {
    const tenantId = tenantOf(user);
    const [items, stocks] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      this.prisma.stock.findMany({ where: { branchId: branch.id } }),
    ]);
    const byItem = new Map(stocks.map((s) => [s.itemId, s]));
    return items.map((i) => {
      const s = byItem.get(i.id);
      const quantity = num(s?.quantity);
      const avgCost = num(s?.avgCost);
      return {
        id: i.id,
        name: i.name,
        type: i.type,
        unit: i.unit,
        isActive: i.isActive,
        minStock: num(i.minStock),
        quantity,
        avgCost,
        value: Math.round(Math.max(0, quantity) * avgCost),
        low: i.isActive && quantity <= num(i.minStock),
      };
    });
  }

  async adjust(user: AuthUser, branch: BranchContext, dto: AdjustDto) {
    const tenantId = tenantOf(user);
    await this.assertItems(tenantId, dto.lines.map((l) => l.itemId));
    const applied = await this.prisma.$transaction(async (tx) => {
      const lines = [];
      for (const l of dto.lines) {
        if (dto.mode === 'COUNT') {
          // Bloquea la fila de existencias para calcular la diferencia exacta.
          const [row] = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
            SELECT "quantity" FROM "Stock" WHERE "itemId" = ${l.itemId} AND "branchId" = ${branch.id} FOR UPDATE`;
          const delta = round3(l.quantity - num(row?.quantity));
          if (delta !== 0) lines.push({ itemId: l.itemId, quantity: delta, unitCost: delta > 0 ? l.unitCost : undefined });
        } else if (dto.mode === 'WASTE') {
          if (l.quantity > 0) lines.push({ itemId: l.itemId, quantity: -l.quantity });
        } else if (l.quantity > 0) {
          lines.push({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost });
        }
      }
      return this.stock.apply(tx, {
        tenantId,
        branchId: branch.id,
        userId: user.id,
        type: dto.mode === 'WASTE' ? 'WASTE' : dto.mode === 'IN' ? 'INITIAL' : 'ADJUSTMENT',
        refType: 'Adjustment',
        note: dto.note?.trim() || undefined,
        lines,
      });
    });
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'inventory.adjusted', data: { mode: dto.mode, lines: applied.length, note: dto.note } });
    return { applied: applied.length };
  }

  async movements(user: AuthUser, branch: BranchContext, itemId?: string, from?: string, to?: string) {
    const rows = await this.prisma.stockMovement.findMany({
      where: { tenantId: tenantOf(user), branchId: branch.id, itemId: itemId || undefined, createdAt: dayRange(from, to) },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { item: { select: { name: true, unit: true } } },
    });
    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({
      ...r,
      quantity: num(r.quantity),
      unitCost: num(r.unitCost),
      balanceAfter: num(r.balanceAfter),
      userName: r.userId ? names.get(r.userId) ?? '' : '',
    }));
  }

  /**
   * Corrige una entrada manual (cantidad y costo) o una merma (cantidad).
   * Actualiza la existencia, el costo promedio y los saldos del kardex desde ese movimiento en adelante.
   */
  async editMovement(user: AuthUser, branch: BranchContext, id: string, dto: EditMovementDto) {
    const tenantId = tenantOf(user);
    if (dto.quantity === undefined && dto.unitCost === undefined) throw new BadRequestException('Indica la cantidad o el costo corregido');
    const result = await this.prisma.$transaction(async (tx) => {
      const mv = await tx.stockMovement.findFirst({ where: { id, tenantId, branchId: branch.id } });
      if (!mv) throw new NotFoundException('Movimiento no encontrado');
      if (mv.type !== 'INITIAL' && mv.type !== 'WASTE') {
        throw new BadRequestException('Solo se pueden corregir entradas manuales y mermas. Para otros casos haz un conteo físico');
      }
      if (mv.type === 'WASTE' && dto.unitCost !== undefined) throw new BadRequestException('A una merma solo se le corrige la cantidad');

      const sign = mv.type === 'INITIAL' ? 1 : -1;
      const oldQty = num(mv.quantity);
      const oldCost = num(mv.unitCost);
      const newQty = dto.quantity !== undefined ? round3(sign * dto.quantity) : oldQty;
      const newCost = dto.unitCost !== undefined ? dto.unitCost : oldCost;

      // Bloquea la existencia del ítem mientras se recalcula su kardex.
      await tx.$queryRaw`SELECT 1 FROM "Stock" WHERE "itemId" = ${mv.itemId} AND "branchId" = ${branch.id} FOR UPDATE`;
      await tx.stockMovement.update({ where: { id }, data: { quantity: newQty, unitCost: newCost } });
      const stock = await this.recalculate(tx, mv.itemId, branch.id);
      const note = [mv.note, `Corregido: ${dto.reason.trim()}`].filter(Boolean).join(' · ').slice(0, 500);
      await tx.stockMovement.update({ where: { id }, data: { note } });
      return { itemId: mv.itemId, before: { quantity: oldQty, unitCost: oldCost }, after: { quantity: newQty, unitCost: newCost }, stock };
    });
    await this.audit.log({
      tenantId, branchId: branch.id, userId: user.id, action: 'inventory.movement_corrected', entity: 'StockMovement', entityId: id,
      data: { reason: dto.reason.trim(), before: result.before, after: result.after },
    });
    return result;
  }

  /**
   * Recorre el kardex del ítem en orden y recalcula saldos, existencia y costo promedio ponderado.
   * Las entradas con costo (manuales, compras, traslados recibidos, anulaciones) mueven el promedio;
   * las salidas y los ajustes de conteo lo conservan.
   */
  private async recalculate(tx: Prisma.TransactionClient, itemId: string, branchId: string) {
    const movements = await tx.stockMovement.findMany({ where: { itemId, branchId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const costed = new Set(['INITIAL', 'PURCHASE', 'TRANSFER_IN', 'VOID']);
    let q = 0;
    let avg = 0;
    for (const m of movements) {
      const qty = num(m.quantity);
      if (qty > 0 && costed.has(m.type)) {
        const cost = num(m.unitCost);
        avg = q <= 0 ? cost : Math.round(((q * avg + qty * cost) / (q + qty)) * 100) / 100;
      }
      q = round3(q + qty);
      if (num(m.balanceAfter) !== q) await tx.stockMovement.update({ where: { id: m.id }, data: { balanceAfter: q } });
    }
    await tx.stock.upsert({
      where: { itemId_branchId: { itemId, branchId } },
      create: { itemId, branchId, quantity: q, avgCost: avg },
      update: { quantity: q, avgCost: avg },
    });
    return { quantity: q, avgCost: avg };
  }

  /** Fija el costo promedio de un ítem en la sede (ej. existencias cargadas sin precio). */
  async setCost(user: AuthUser, branch: BranchContext, itemId: string, dto: SetCostDto) {
    const tenantId = tenantOf(user);
    await this.assertItems(tenantId, [itemId]);
    const before = await this.prisma.stock.findUnique({ where: { itemId_branchId: { itemId, branchId: branch.id } } });
    const stock = await this.prisma.stock.upsert({
      where: { itemId_branchId: { itemId, branchId: branch.id } },
      create: { itemId, branchId: branch.id, quantity: 0, avgCost: dto.avgCost },
      update: { avgCost: dto.avgCost },
    });
    await this.audit.log({
      tenantId, branchId: branch.id, userId: user.id, action: 'inventory.cost_set', entity: 'InventoryItem', entityId: itemId,
      data: { from: num(before?.avgCost), to: dto.avgCost, reason: dto.reason?.trim() },
    });
    return { itemId, quantity: num(stock.quantity), avgCost: num(stock.avgCost) };
  }

  // ───────── Proveedores ─────────

  suppliers(user: AuthUser) {
    return this.prisma.supplier.findMany({ where: { tenantId: tenantOf(user) }, orderBy: { name: 'asc' } });
  }

  async saveSupplier(user: AuthUser, dto: SupplierDto, id?: string) {
    const tenantId = tenantOf(user);
    if (id) {
      const found = await this.prisma.supplier.findFirst({ where: { id, tenantId } });
      if (!found) throw new NotFoundException('Proveedor no encontrado');
      return this.prisma.supplier.update({ where: { id }, data: { ...dto, name: dto.name.trim() } });
    }
    return this.prisma.supplier.create({ data: { ...dto, name: dto.name.trim(), tenantId } });
  }

  // ───────── Compras ─────────

  async purchases(user: AuthUser, branch: BranchContext, from?: string, to?: string) {
    return this.prisma.purchase.findMany({
      where: { tenantId: tenantOf(user), branchId: branch.id, date: dayRange(from, to) },
      orderBy: { date: 'desc' },
      include: { supplier: { select: { name: true } }, _count: { select: { items: true } } },
    });
  }

  async purchase(user: AuthUser, branch: BranchContext, id: string) {
    const p = await this.prisma.purchase.findFirst({
      where: { id, tenantId: tenantOf(user), branchId: branch.id },
      include: { supplier: true, items: true },
    });
    if (!p) throw new NotFoundException('Compra no encontrada');
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: p.items.map((i) => i.itemId) } }, select: { id: true, name: true, unit: true } });
    const byId = new Map(items.map((i) => [i.id, i]));
    return { ...p, items: p.items.map((i) => ({ ...i, quantity: num(i.quantity), unitCost: num(i.unitCost), item: byId.get(i.itemId) })) };
  }

  async createPurchase(user: AuthUser, branch: BranchContext, dto: PurchaseDto) {
    const tenantId = tenantOf(user);
    await this.assertItems(tenantId, dto.items.map((i) => i.itemId));
    if (dto.supplierId && !(await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, tenantId } }))) {
      throw new BadRequestException('Proveedor inválido');
    }
    const lines = dto.items.map((i) => ({ ...i, total: Math.round(i.quantity * i.unitCost) }));
    const total = lines.reduce((s, l) => s + l.total, 0);
    const session = dto.paidFromCash ? await this.cash.openSession(branch.id) : null;

    const purchase = await this.prisma.$transaction(async (tx) => {
      if (session) {
        await this.cash.lockOpen(tx, session.id, true);
        const summary = await this.cash.summary(session.id, tx);
        if (total > summary.expected.CASH) throw new BadRequestException('No hay suficiente efectivo en caja para pagar la compra');
      }
      const purchase = await tx.purchase.create({
        data: {
          tenantId,
          branchId: branch.id,
          supplierId: dto.supplierId,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          date: dto.date ? new Date(dto.date) : new Date(),
          notes: dto.notes?.trim() || null,
          paidFromCash: !!session,
          total,
          createdById: user.id,
          items: { create: lines },
        },
        include: { supplier: true },
      });
      await this.stock.apply(tx, {
        tenantId,
        branchId: branch.id,
        userId: user.id,
        type: 'PURCHASE',
        refType: 'Purchase',
        refId: purchase.id,
        note: [purchase.supplier?.name, purchase.invoiceNumber && `Fact. ${purchase.invoiceNumber}`].filter(Boolean).join(' · ') || 'Compra',
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost })),
      });
      if (session) {
        await tx.cashMovement.create({
          data: {
            tenantId,
            branchId: branch.id,
            sessionId: session.id,
            type: 'EXPENSE',
            amount: total,
            description: `Compra${purchase.supplier ? ` a ${purchase.supplier.name}` : ''}${purchase.invoiceNumber ? ` (fact. ${purchase.invoiceNumber})` : ''}`,
            createdById: user.id,
          },
        });
      }
      return purchase;
    });
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'purchase.created', entity: 'Purchase', entityId: purchase.id, data: { total, paidFromCash: !!session } });
    return this.purchase(user, branch, purchase.id);
  }

  // ───────── Traslados ─────────

  async transferBranches(user: AuthUser, branch: BranchContext) {
    return this.prisma.branch.findMany({
      where: { tenantId: tenantOf(user), isActive: true, id: { not: branch.id } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async transfers(user: AuthUser, branch: BranchContext) {
    const tenantId = tenantOf(user);
    const transfers = await this.prisma.transfer.findMany({
      where: { tenantId, OR: [{ fromBranchId: branch.id }, { toBranchId: branch.id }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { items: true },
    });
    const [branches, items] = await Promise.all([
      this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.inventoryItem.findMany({ where: { tenantId }, select: { id: true, name: true, unit: true } }),
    ]);
    const bName = new Map(branches.map((b) => [b.id, b.name]));
    const iInfo = new Map(items.map((i) => [i.id, i]));
    return transfers.map((t) => ({
      ...t,
      fromBranch: bName.get(t.fromBranchId),
      toBranch: bName.get(t.toBranchId),
      direction: t.fromBranchId === branch.id ? 'OUT' : 'IN',
      items: t.items.map((i) => ({ ...i, quantity: num(i.quantity), unitCost: num(i.unitCost), item: iInfo.get(i.itemId) })),
    }));
  }

  async createTransfer(user: AuthUser, branch: BranchContext, dto: TransferDto) {
    const tenantId = tenantOf(user);
    if (dto.toBranchId === branch.id) throw new BadRequestException('La sede destino debe ser diferente');
    const dest = await this.prisma.branch.findFirst({ where: { id: dto.toBranchId, tenantId, isActive: true } });
    if (!dest) throw new BadRequestException('Sede destino inválida');
    await this.assertItems(tenantId, dto.items.map((i) => i.itemId));

    const transfer = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.create({
        data: { tenantId, fromBranchId: branch.id, toBranchId: dest.id, notes: dto.notes?.trim() || null, createdById: user.id },
      });
      const out = await this.stock.apply(tx, {
        tenantId,
        branchId: branch.id,
        userId: user.id,
        type: 'TRANSFER_OUT',
        refType: 'Transfer',
        refId: transfer.id,
        note: `Traslado a ${dest.name}`,
        lines: dto.items.map((i) => ({ itemId: i.itemId, quantity: -i.quantity })),
      });
      // Se guarda el costo promedio de origen para valorizar la entrada en destino.
      await tx.transferItem.createMany({
        data: out.map((o) => ({ transferId: transfer.id, itemId: o.itemId, quantity: -o.quantity, unitCost: o.unitCost })),
      });
      return transfer;
    });
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'transfer.sent', entity: 'Transfer', entityId: transfer.id, data: { to: dest.name } });
    return transfer;
  }

  async receiveTransfer(user: AuthUser, branch: BranchContext, id: string) {
    const tenantId = tenantOf(user);
    await this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, tenantId, id);
      if (transfer.toBranchId !== branch.id) throw new BadRequestException('Este traslado se recibe en la sede destino');
      const from = await tx.branch.findUniqueOrThrow({ where: { id: transfer.fromBranchId } });
      await this.stock.apply(tx, {
        tenantId,
        branchId: branch.id,
        userId: user.id,
        type: 'TRANSFER_IN',
        refType: 'Transfer',
        refId: id,
        note: `Traslado desde ${from.name}`,
        lines: transfer.items.map((i) => ({ itemId: i.itemId, quantity: num(i.quantity), unitCost: num(i.unitCost) })),
      });
      await tx.transfer.update({ where: { id }, data: { status: 'RECEIVED', receivedById: user.id, receivedAt: new Date() } });
    });
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'transfer.received', entity: 'Transfer', entityId: id });
    return { id };
  }

  async cancelTransfer(user: AuthUser, branch: BranchContext, id: string) {
    const tenantId = tenantOf(user);
    await this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, tenantId, id);
      if (transfer.fromBranchId !== branch.id) throw new BadRequestException('Solo la sede de origen puede cancelar el traslado');
      await this.stock.apply(tx, {
        tenantId,
        branchId: branch.id,
        userId: user.id,
        type: 'TRANSFER_IN',
        refType: 'Transfer',
        refId: id,
        note: 'Traslado cancelado (devolución)',
        lines: transfer.items.map((i) => ({ itemId: i.itemId, quantity: num(i.quantity), unitCost: num(i.unitCost) })),
      });
      await tx.transfer.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'transfer.cancelled', entity: 'Transfer', entityId: id });
    return { id };
  }

  private async lockTransfer(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Transfer" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Traslado no encontrado');
    const transfer = await tx.transfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (transfer.status !== 'SENT') throw new BadRequestException('El traslado ya fue procesado');
    return transfer;
  }

  private async assertItems(tenantId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.inventoryItem.count({ where: { tenantId, id: { in: unique } } });
    if (count !== unique.length) throw new BadRequestException('Hay ítems de inventario inválidos');
  }
}
