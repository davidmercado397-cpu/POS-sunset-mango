import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashService, CashSummary, METHODS } from '../cash/cash.service';
import { AuthUser, BranchContext } from '../common/auth-user';
import { dayRange, tenantOf } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

const pad = (n: number) => String(n).padStart(2, '0');

/** Fechas (YYYY-MM-DD) del primer y último día del mes. */
function monthBounds(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

/** Fecha de hoy en Colombia (UTC-5). */
const todayCO = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const zeroDiff = () => Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<string, number>;

@Injectable()
export class MonthlyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly cash: CashService,
    private readonly audit: AuditService,
  ) {}

  private validate(year: number, month: number) {
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Mes inválido');
    }
  }

  /** Gastos administrativos del mes. `branchIds = null` incluye todo el negocio (también los generales). */
  private async adminExpenses(tenantId: string, range: { gte: Date; lt: Date }, branchIds: string[] | null) {
    const rows = await this.prisma.adminExpense.findMany({
      where: { tenantId, date: range, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
      include: { category: { select: { name: true } } },
    });
    const byCategory = new Map<string, number>();
    for (const r of rows) {
      const key = r.category?.name ?? 'Sin categoría';
      byCategory.set(key, (byCategory.get(key) ?? 0) + r.amount);
    }
    return {
      total: rows.reduce((s, r) => s + r.amount, 0),
      byCategory: [...byCategory].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
      byBranch: rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.branchId ?? 'general']: (acc[r.branchId ?? 'general'] ?? 0) + r.amount }), {}),
    };
  }

  private async daysOf(tenantId: string, branchId: string, range: { gte: Date; lt: Date }) {
    const sessions = await this.prisma.cashSession.findMany({
      where: { tenantId, branchId, openedAt: range },
      orderBy: { openedAt: 'asc' },
      include: { openedBy: { select: { fullName: true } }, closedBy: { select: { fullName: true } } },
    });
    return Promise.all(
      sessions.map(async (s) => {
        const summary = s.status === 'CLOSED' && s.summary ? (s.summary as unknown as CashSummary) : await this.cash.summary(s.id);
        return {
          id: s.id,
          status: s.status,
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          openedBy: s.openedBy.fullName,
          closedBy: s.closedBy?.fullName ?? null,
          salesCount: summary.salesCount,
          salesTotal: summary.salesTotal,
          tipsTotal: summary.tipsTotal,
          expenses: summary.expenses + (summary.expensesTransfer ?? 0),
          expected: summary.expected,
          counted: summary.counted ?? null,
          difference: summary.difference ?? null,
        };
      }),
    );
  }

  /** Resultado = ventas − costo de lo vendido (si hay inventario) − gastos de caja − gastos administrativos. */
  private result(totals: { salesTotal: number; cost: number | null; expenses: number }, adminTotal: number) {
    return totals.salesTotal - (totals.cost ?? 0) - totals.expenses - adminTotal;
  }

  /** Consolida el mes de una sede: ventas, métodos de pago, gastos y cada cierre diario con su diferencia. */
  async compute(user: AuthUser, branch: BranchContext, year: number, month: number) {
    this.validate(year, month);
    const tenantId = tenantOf(user);
    const { from, to } = monthBounds(year, month);
    const range = dayRange(from, to);
    const [report, days, admin] = await Promise.all([
      this.reports.summary(user, branch, from, to),
      this.daysOf(tenantId, branch.id, range),
      this.adminExpenses(tenantId, range, [branch.id]),
    ]);

    const differences = zeroDiff();
    for (const d of days) for (const m of METHODS) differences[m] += d.difference?.[m] ?? 0;
    const openSessions = days.filter((d) => d.status === 'OPEN').length;
    const monthEnded = todayCO() > to;

    return {
      period: { year, month, from, to },
      totals: report.totals,
      adminExpenses: { total: admin.total, byCategory: admin.byCategory },
      result: this.result(report.totals, admin.total),
      byMethod: report.byMethod,
      byDay: report.byDay,
      byCategory: report.byCategory,
      topProducts: report.topProducts.slice(0, 15),
      expenses: report.expenses,
      days,
      differences,
      canClose: monthEnded && openSessions === 0,
      blockers: [
        ...(monthEnded ? [] : ['El mes aún no ha terminado']),
        ...(openSessions ? [`Hay ${openSessions} caja(s) abierta(s) en el mes`] : []),
      ],
    };
  }

  async get(user: AuthUser, branch: BranchContext, year: number, month: number) {
    this.validate(year, month);
    const closed = await this.prisma.monthlyClose.findUnique({ where: { branchId_year_month: { branchId: branch.id, year, month } } });
    if (closed && closed.tenantId === tenantOf(user)) {
      const by = await this.prisma.user.findUnique({ where: { id: closed.closedById }, select: { fullName: true } });
      return { ...(closed.summary as object), closed: { at: closed.closedAt, by: by?.fullName ?? '', notes: closed.notes }, canClose: false, blockers: [] };
    }
    return { ...(await this.compute(user, branch, year, month)), closed: null };
  }

  async close(user: AuthUser, branch: BranchContext, year: number, month: number, notes?: string) {
    const tenantId = tenantOf(user);
    const data = await this.compute(user, branch, year, month);
    if (!data.canClose) throw new BadRequestException(data.blockers.join('. '));
    const { canClose: _c, blockers: _b, ...snapshot } = data;
    try {
      await this.prisma.monthlyClose.create({
        data: { tenantId, branchId: branch.id, year, month, notes: notes?.trim() || null, closedById: user.id, summary: snapshot as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Este mes ya fue cerrado');
      throw err;
    }
    await this.audit.log({
      tenantId, branchId: branch.id, userId: user.id, action: 'cash.monthly_closed',
      data: { period: `${year}-${pad(month)}`, sales: data.totals.salesTotal, differences: data.differences },
    });
    return this.get(user, branch, year, month);
  }

  /** Reabre un mes cerrado (solo administrador). La copia anterior queda en la auditoría. */
  async reopen(user: AuthUser, branch: BranchContext, year: number, month: number, reason: string) {
    this.validate(year, month);
    const tenantId = tenantOf(user);
    const closed = await this.prisma.monthlyClose.findUnique({ where: { branchId_year_month: { branchId: branch.id, year, month } } });
    if (!closed || closed.tenantId !== tenantId) throw new NotFoundException('Ese mes no está cerrado');
    await this.prisma.monthlyClose.delete({ where: { id: closed.id } });
    const snapshot = closed.summary as { totals?: { salesTotal?: number }; differences?: Record<string, number> };
    await this.audit.log({
      tenantId, branchId: branch.id, userId: user.id, action: 'cash.monthly_reopened',
      data: { period: `${year}-${pad(month)}`, reason: reason.trim(), closedAt: closed.closedAt.toISOString(), sales: snapshot.totals?.salesTotal ?? 0, differences: snapshot.differences ?? {} },
    });
    return this.get(user, branch, year, month);
  }

  /** Consolidado del mes con todas las sedes del negocio (solo administrador). */
  async consolidated(user: AuthUser, branch: BranchContext, year: number, month: number) {
    this.validate(year, month);
    if (!user.permissions.includes('branches.manage')) throw new ForbiddenException('Solo el administrador puede ver todas las sedes');
    const tenantId = tenantOf(user);
    const { from, to } = monthBounds(year, month);
    const range = dayRange(from, to);
    const [report, admin, branches, closes] = await Promise.all([
      this.reports.summary(user, branch, from, to, 'all'),
      this.adminExpenses(tenantId, range, null),
      this.prisma.branch.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      this.prisma.monthlyClose.findMany({ where: { tenantId, year, month } }),
    ]);
    const closers = await this.prisma.user.findMany({ where: { id: { in: closes.map((c) => c.closedById) } }, select: { id: true, fullName: true } });
    const closerName = new Map(closers.map((u) => [u.id, u.fullName]));

    const perBranch = await Promise.all(
      branches.map(async (b) => {
        const days = await this.daysOf(tenantId, b.id, range);
        const differences = zeroDiff();
        for (const d of days) for (const m of METHODS) differences[m] += d.difference?.[m] ?? 0;
        const close = closes.find((c) => c.branchId === b.id);
        return {
          id: b.id,
          name: b.name,
          isActive: b.isActive,
          salesTotal: days.reduce((s, d) => s + d.salesTotal, 0),
          salesCount: days.reduce((s, d) => s + d.salesCount, 0),
          tipsTotal: days.reduce((s, d) => s + d.tipsTotal, 0),
          cashExpenses: days.reduce((s, d) => s + d.expenses, 0),
          adminExpenses: admin.byBranch[b.id] ?? 0,
          cashDays: days.length,
          openSessions: days.filter((d) => d.status === 'OPEN').length,
          difference: METHODS.reduce((s, m) => s + differences[m], 0),
          closed: close ? { at: close.closedAt, by: closerName.get(close.closedById) ?? '' } : null,
        };
      }),
    );
    const totalDifference = perBranch.reduce((s, b) => s + b.difference, 0);

    return {
      period: { year, month, from, to },
      totals: report.totals,
      adminExpenses: { total: admin.total, general: admin.byBranch.general ?? 0, byCategory: admin.byCategory },
      result: this.result(report.totals, admin.total),
      byMethod: report.byMethod,
      byDay: report.byDay,
      byCategory: report.byCategory,
      expenses: report.expenses,
      branches: perBranch.filter((b) => b.isActive || b.cashDays > 0),
      totalDifference,
      allClosed: perBranch.filter((b) => b.cashDays > 0).every((b) => b.closed),
    };
  }

  async history(user: AuthUser, branch: BranchContext) {
    const rows = await this.prisma.monthlyClose.findMany({
      where: { tenantId: tenantOf(user), branchId: branch.id },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return rows.map((r) => {
      const s = r.summary as { totals?: { salesTotal?: number; salesCount?: number }; differences?: Record<string, number> };
      return {
        id: r.id,
        year: r.year,
        month: r.month,
        closedAt: r.closedAt,
        salesTotal: s.totals?.salesTotal ?? 0,
        salesCount: s.totals?.salesCount ?? 0,
        difference: Object.values(s.differences ?? {}).reduce((a, b) => a + b, 0),
      };
    });
  }
}
