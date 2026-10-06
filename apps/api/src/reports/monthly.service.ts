import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
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

  /** Consolida el mes: ventas, métodos de pago, gastos y cada cierre diario con su diferencia. */
  async compute(user: AuthUser, branch: BranchContext, year: number, month: number) {
    this.validate(year, month);
    const tenantId = tenantOf(user);
    const { from, to } = monthBounds(year, month);
    const range = dayRange(from, to);
    const report = await this.reports.summary(user, branch, from, to);

    const sessions = await this.prisma.cashSession.findMany({
      where: { tenantId, branchId: branch.id, openedAt: range },
      orderBy: { openedAt: 'asc' },
      include: { openedBy: { select: { fullName: true } }, closedBy: { select: { fullName: true } } },
    });
    const days = await Promise.all(
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

    const differences = Object.fromEntries(METHODS.map((m) => [m, days.reduce((sum, d) => sum + (d.difference?.[m] ?? 0), 0)])) as Record<string, number>;
    const openSessions = days.filter((d) => d.status === 'OPEN').length;
    const monthEnded = todayCO() > to;

    return {
      period: { year, month, from, to },
      totals: report.totals,
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
