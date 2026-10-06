import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, BranchContext } from '../common/auth-user';
import { dayRange, num, tenantOf } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';

const TZ = 'America/Bogota';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resumen del periodo. `scope = all` agrega todas las sedes del negocio
   * (solo para quien administra sedes).
   */
  async summary(user: AuthUser, branch: BranchContext, from?: string, to?: string, scope?: string) {
    const tenantId = tenantOf(user);
    const all = scope === 'all';
    if (all && !user.permissions.includes('branches.manage')) throw new ForbiddenException('Solo el administrador puede ver todas las sedes');
    const range = dayRange(from, to);
    const branchIds = all
      ? (await this.prisma.branch.findMany({ where: { tenantId }, select: { id: true } })).map((b) => b.id)
      : [branch.id];
    const bIds = Prisma.join(branchIds);

    const saleWhere: Prisma.SaleWhereInput = { tenantId, branchId: { in: branchIds }, status: 'COMPLETED', completedAt: range };

    const [totals, voided, payments, tips, byDay, byHour, topProducts, byUser, expenses, purchases, cogs, sessions, byBranch] = await Promise.all([
      this.prisma.sale.aggregate({ where: saleWhere, _sum: { subtotal: true, tipAmount: true }, _count: true }),
      this.prisma.sale.aggregate({ where: { tenantId, branchId: { in: branchIds }, status: 'VOIDED', voidedAt: range }, _sum: { subtotal: true }, _count: true }),
      this.prisma.payment.groupBy({ by: ['method'], where: { sale: saleWhere }, _sum: { amount: true } }),
      this.prisma.sale.groupBy({ by: ['tipMethod'], where: { ...saleWhere, tipAmount: { gt: 0 } }, _sum: { tipAmount: true } }),
      this.prisma.$queryRaw<{ day: string; total: bigint; count: bigint }[]>`
        SELECT to_char(("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
               SUM("subtotal")::bigint AS total, COUNT(*)::bigint AS count
        FROM "Sale"
        WHERE "tenantId" = ${tenantId} AND "branchId" IN (${bIds}) AND status = 'COMPLETED'
          AND "completedAt" >= ${range.gte} AND "completedAt" < ${range.lt}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ hour: number; total: bigint; count: bigint }[]>`
        SELECT EXTRACT(HOUR FROM ("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::int AS hour,
               SUM("subtotal")::bigint AS total, COUNT(*)::bigint AS count
        FROM "Sale"
        WHERE "tenantId" = ${tenantId} AND "branchId" IN (${bIds}) AND status = 'COMPLETED'
          AND "completedAt" >= ${range.gte} AND "completedAt" < ${range.lt}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ productId: string | null; name: string; category: string | null; quantity: bigint; total: bigint }[]>`
        SELECT i."productId", i."productName" AS name, c.name AS category,
               SUM(i.quantity)::bigint AS quantity, SUM(i."lineTotal")::bigint AS total
        FROM "SaleItem" i
        JOIN "Sale" s ON s.id = i."saleId"
        LEFT JOIN "Product" p ON p.id = i."productId"
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        WHERE s."tenantId" = ${tenantId} AND s."branchId" IN (${bIds}) AND s.status = 'COMPLETED'
          AND s."completedAt" >= ${range.gte} AND s."completedAt" < ${range.lt}
        GROUP BY 1, 2, 3 ORDER BY total DESC`,
      this.prisma.$queryRaw<{ name: string; total: bigint; count: bigint; tips: bigint }[]>`
        SELECT u."fullName" AS name, SUM(s.subtotal)::bigint AS total, COUNT(*)::bigint AS count, SUM(s."tipAmount")::bigint AS tips
        FROM "Sale" s JOIN "User" u ON u.id = s."createdById"
        WHERE s."tenantId" = ${tenantId} AND s."branchId" IN (${bIds}) AND s.status = 'COMPLETED'
          AND s."completedAt" >= ${range.gte} AND s."completedAt" < ${range.lt}
        GROUP BY 1 ORDER BY total DESC`,
      this.prisma.$queryRaw<{ type: string; method: string; category: string | null; total: bigint }[]>`
        SELECT m.type, m.method::text AS method, c.name AS category, SUM(m.amount)::bigint AS total
        FROM "CashMovement" m LEFT JOIN "ExpenseCategory" c ON c.id = m."categoryId"
        WHERE m."tenantId" = ${tenantId} AND m."branchId" IN (${bIds}) AND m.type IN ('EXPENSE', 'WITHDRAWAL')
          AND m."createdAt" >= ${range.gte} AND m."createdAt" < ${range.lt}
        GROUP BY 1, 2, 3 ORDER BY total DESC`,
      this.prisma.purchase.aggregate({ where: { tenantId, branchId: { in: branchIds }, date: range }, _sum: { total: true }, _count: true }),
      // Costo de lo vendido = salidas por venta − devoluciones por anulación, al costo promedio del momento.
      this.prisma.$queryRaw<{ cost: Prisma.Decimal | null }[]>`
        SELECT SUM(-quantity * "unitCost") AS cost FROM "StockMovement"
        WHERE "tenantId" = ${tenantId} AND "branchId" IN (${bIds}) AND type IN ('SALE', 'VOID')
          AND "createdAt" >= ${range.gte} AND "createdAt" < ${range.lt}`,
      this.prisma.cashSession.findMany({
        where: { tenantId, branchId: { in: branchIds }, status: 'CLOSED', closedAt: range },
        select: { summary: true },
      }),
      all
        ? this.prisma.$queryRaw<{ name: string; total: bigint; count: bigint }[]>`
            SELECT b.name, COALESCE(SUM(s.subtotal), 0)::bigint AS total, COUNT(s.id)::bigint AS count
            FROM "Branch" b LEFT JOIN "Sale" s ON s."branchId" = b.id AND s.status = 'COMPLETED'
              AND s."completedAt" >= ${range.gte} AND s."completedAt" < ${range.lt}
            WHERE b."tenantId" = ${tenantId}
            GROUP BY b.id, b.name ORDER BY total DESC`
        : Promise.resolve([]),
    ]);

    const tipsBy: Record<string, number> = {};
    for (const t of tips) if (t.tipMethod) tipsBy[t.tipMethod] = t._sum.tipAmount ?? 0;
    const byMethod = ['CASH', 'TRANSFER', 'QR_BOLD'].map((m) => {
      const collected = payments.find((p) => p.method === m)?._sum.amount ?? 0;
      return { method: m, sales: collected - (tipsBy[m] ?? 0), tips: tipsBy[m] ?? 0 };
    });

    // Agrupa productos por categoría para el reporte de categorías.
    const catMap = new Map<string, { name: string; total: number; quantity: number }>();
    for (const p of topProducts) {
      const key = p.category ?? 'Sin categoría';
      const prev = catMap.get(key) ?? { name: key, total: 0, quantity: 0 };
      catMap.set(key, { name: key, total: prev.total + Number(p.total), quantity: prev.quantity + Number(p.quantity) });
    }

    const differences = { CASH: 0, TRANSFER: 0, QR_BOLD: 0 };
    for (const s of sessions) {
      const d = (s.summary as { difference?: Record<string, number> } | null)?.difference;
      if (d) for (const k of Object.keys(differences) as (keyof typeof differences)[]) differences[k] += d[k] ?? 0;
    }

    const salesTotal = totals._sum.subtotal ?? 0;
    const cost = Math.round(num(cogs[0]?.cost));
    const hasInventory = branchIds.length > 0 && user.tenantModules.includes('inventory');

    return {
      range: { from: range.gte, to: range.lt },
      totals: {
        salesCount: totals._count,
        salesTotal,
        tips: totals._sum.tipAmount ?? 0,
        avgTicket: totals._count ? Math.round(salesTotal / totals._count) : 0,
        voidedCount: voided._count,
        voidedTotal: voided._sum.subtotal ?? 0,
        purchases: purchases._sum.total ?? 0,
        purchasesCount: purchases._count,
        expenses: expenses.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + Number(e.total), 0),
        expensesTransfer: expenses.filter((e) => e.type === 'EXPENSE' && e.method === 'TRANSFER').reduce((s, e) => s + Number(e.total), 0),
        withdrawals: expenses.filter((e) => e.type === 'WITHDRAWAL').reduce((s, e) => s + Number(e.total), 0),
        cost: hasInventory ? cost : null,
        grossProfit: hasInventory ? salesTotal - cost : null,
        cashSessions: sessions.length,
        differences,
      },
      byMethod,
      byDay: byDay.map((d) => ({ day: d.day, total: Number(d.total), count: Number(d.count) })),
      byHour: byHour.map((h) => ({ hour: h.hour, total: Number(h.total), count: Number(h.count) })),
      topProducts: topProducts.map((p) => ({ name: p.name, category: p.category, quantity: Number(p.quantity), total: Number(p.total) })),
      byCategory: [...catMap.values()].sort((a, b) => b.total - a.total),
      byUser: byUser.map((u) => ({ name: u.name, total: Number(u.total), count: Number(u.count), tips: Number(u.tips) })),
      expenses: expenses.map((e) => ({
        type: e.type,
        method: e.method,
        category: e.category ?? (e.type === 'WITHDRAWAL' ? 'Salidas de efectivo' : 'Otros (texto libre)'),
        total: Number(e.total),
      })),
      byBranch: byBranch.map((b) => ({ name: b.name, total: Number(b.total), count: Number(b.count) })),
    };
  }

  /** Costo teórico de cada producto según su receta y el costo promedio de la sede. */
  async productMargins(user: AuthUser, branch: BranchContext) {
    const tenantId = tenantOf(user);
    const [products, stocks] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        include: { recipe: true, category: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.stock.findMany({ where: { branchId: branch.id } }),
    ]);
    const cost = new Map(stocks.map((s) => [s.itemId, num(s.avgCost)]));
    return products.map((p) => {
      const unitCost = Math.round(p.recipe.reduce((s, l) => s + num(l.quantity) * (cost.get(l.inventoryItemId) ?? 0), 0));
      return {
        id: p.id,
        name: p.name,
        category: p.category?.name ?? null,
        price: p.price,
        cost: unitCost,
        margin: p.price - unitCost,
        marginPct: p.price ? Math.round(((p.price - unitCost) / p.price) * 1000) / 10 : 0,
        hasRecipe: p.recipe.length > 0,
      };
    });
  }
}
