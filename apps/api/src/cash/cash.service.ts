import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, BranchContext } from '../common/auth-user';
import { dayRange, tenantOf } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { CashMovementDto, CloseCashDto, OpenCashDto } from './cash.dto';

export const METHODS: PaymentMethod[] = ['CASH', 'TRANSFER', 'QR_BOLD'];
export const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];

type ByMethod = Record<PaymentMethod, number>;
const zero = (): ByMethod => ({ CASH: 0, TRANSFER: 0, QR_BOLD: 0 });

export interface CashSummary {
  openingAmount: number;
  salesCount: number;
  voidedCount: number;
  salesTotal: number;
  /** Descuentos otorgados (ya restados de salesTotal) */
  discountsTotal?: number;
  tipsTotal: number;
  /** Dinero recibido por método (ventas + propinas) */
  collected: ByMethod;
  /** Ventas por método, sin propinas */
  sales: ByMethod;
  tips: ByMethod;
  /** Gastos pagados con efectivo de la caja */
  expenses: number;
  /** Gastos pagados por transferencia (no afectan el efectivo esperado) */
  expensesTransfer: number;
  withdrawals: number;
  deposits: number;
  expected: ByMethod;
  counted?: ByMethod;
  difference?: ByMethod;
}

/** Suma de un conteo por denominaciones; ignora denominaciones desconocidas. */
export function countTotal(count?: Record<string, number> | null): number {
  if (!count) return 0;
  return DENOMINATIONS.reduce((sum, d) => sum + d * Math.max(0, Math.floor(Number(count[String(d)]) || 0)), 0);
}

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Calcula el cuadre de una sesión de caja a partir de ventas y movimientos. */
  async summary(sessionId: string, db: Prisma.TransactionClient = this.prisma): Promise<CashSummary> {
    const session = await db.cashSession.findUniqueOrThrow({ where: { id: sessionId } });
    const [payments, sales, voided, movements] = await Promise.all([
      db.payment.groupBy({ by: ['method'], where: { sale: { cashSessionId: sessionId, status: 'COMPLETED' } }, _sum: { amount: true } }),
      db.sale.findMany({ where: { cashSessionId: sessionId, status: 'COMPLETED' }, select: { subtotal: true, discount: true, tipAmount: true, tipMethod: true } }),
      db.sale.count({ where: { cashSessionId: sessionId, status: 'VOIDED' } }),
      db.cashMovement.groupBy({ by: ['type', 'method'], where: { sessionId }, _sum: { amount: true } }),
    ]);

    const collected = zero();
    for (const p of payments) collected[p.method] = p._sum.amount ?? 0;
    const tips = zero();
    for (const s of sales) if (s.tipAmount && s.tipMethod) tips[s.tipMethod] += s.tipAmount;
    const salesBy = zero();
    for (const m of METHODS) salesBy[m] = collected[m] - tips[m];
    const mv = (t: string, method: PaymentMethod = 'CASH') =>
      movements.filter((m) => m.type === t && m.method === method).reduce((s, m) => s + (m._sum.amount ?? 0), 0);
    const expenses = mv('EXPENSE');
    const expensesTransfer = mv('EXPENSE', 'TRANSFER');
    const withdrawals = mv('WITHDRAWAL');
    const deposits = mv('DEPOSIT');

    return {
      openingAmount: session.openingAmount,
      salesCount: sales.length,
      voidedCount: voided,
      salesTotal: sales.reduce((s, x) => s + x.subtotal, 0),
      discountsTotal: sales.reduce((s, x) => s + x.discount, 0),
      tipsTotal: sales.reduce((s, x) => s + x.tipAmount, 0),
      collected,
      sales: salesBy,
      tips,
      expenses,
      expensesTransfer,
      withdrawals,
      deposits,
      expected: {
        CASH: session.openingAmount + collected.CASH + deposits - expenses - withdrawals,
        TRANSFER: collected.TRANSFER,
        QR_BOLD: collected.QR_BOLD,
      },
    };
  }

  async current(branch: BranchContext) {
    const session = await this.prisma.cashSession.findFirst({
      where: { branchId: branch.id, status: 'OPEN' },
      include: {
        openedBy: { select: { fullName: true } },
        movements: { orderBy: { createdAt: 'desc' }, include: { category: true, createdBy: { select: { fullName: true } } } },
      },
    });
    if (!session) return { session: null, denominations: DENOMINATIONS };
    const openOrders = await this.prisma.sale.count({ where: { branchId: branch.id, status: 'OPEN' } });
    return { session, summary: await this.summary(session.id), openOrders, denominations: DENOMINATIONS };
  }

  async open(user: AuthUser, branch: BranchContext, dto: OpenCashDto) {
    const tenantId = tenantOf(user);
    const openingAmount = dto.openingCount ? countTotal(dto.openingCount) : dto.openingAmount;
    try {
      const session = await this.prisma.cashSession.create({
        data: { tenantId, branchId: branch.id, openedById: user.id, openingAmount, openingCount: dto.openingCount, notes: dto.notes },
      });
      await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'cash.opened', entity: 'CashSession', entityId: session.id, data: { openingAmount } });
      return session;
    } catch (err) {
      // Índice único parcial: solo una caja abierta por sede.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya hay una caja abierta en esta sede');
      }
      throw err;
    }
  }

  async addMovement(user: AuthUser, branch: BranchContext, dto: CashMovementDto) {
    const tenantId = tenantOf(user);
    const session = await this.openSession(branch.id);
    const method = dto.type === 'EXPENSE' ? dto.method ?? 'CASH' : 'CASH';
    if (dto.type !== 'EXPENSE' && dto.method && dto.method !== 'CASH') {
      throw new BadRequestException('Las salidas y entradas de caja siempre son en efectivo');
    }
    if (dto.type === 'EXPENSE' && !dto.categoryId && !dto.description?.trim()) {
      throw new BadRequestException('Indica la categoría o la descripción del gasto');
    }
    if (dto.categoryId && !(await this.prisma.expenseCategory.findFirst({ where: { id: dto.categoryId, tenantId } }))) {
      throw new BadRequestException('Categoría inválida');
    }
    const movement = await this.prisma.$transaction(async (tx) => {
      await this.lockOpen(tx, session.id, true);
      if (dto.type !== 'DEPOSIT' && method === 'CASH') {
        const summary = await this.summary(session.id, tx);
        if (dto.amount > summary.expected.CASH) {
          throw new BadRequestException('El valor supera el efectivo disponible en caja');
        }
      }
      return tx.cashMovement.create({
        data: {
          tenantId,
          branchId: branch.id,
          sessionId: session.id,
          type: dto.type,
          method,
          amount: dto.amount,
          categoryId: dto.type === 'EXPENSE' ? dto.categoryId : null,
          description: dto.description?.trim() || null,
          createdById: user.id,
        },
      });
    });
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'cash.movement', entity: 'CashMovement', entityId: movement.id, data: { type: dto.type, method, amount: dto.amount } });
    return movement;
  }

  async close(user: AuthUser, branch: BranchContext, dto: CloseCashDto) {
    const tenantId = tenantOf(user);
    const session = await this.openSession(branch.id);
    const openOrders = await this.prisma.sale.count({ where: { branchId: branch.id, status: 'OPEN' } });
    if (openOrders) throw new BadRequestException(`Hay ${openOrders} cuenta(s) abierta(s). Cóbralas o anúlalas antes de cerrar la caja`);

    const counted = { ...dto.counted };
    if (dto.closingCount) counted.CASH = countTotal(dto.closingCount);

    const closed = await this.prisma.$transaction(async (tx) => {
      await this.lockOpen(tx, session.id, true);
      const summary = await this.summary(session.id, tx);
      const difference = zero();
      for (const m of METHODS) difference[m] = counted[m] - summary.expected[m];
      const full: CashSummary = { ...summary, counted, difference };
      const { count } = await tx.cashSession.updateMany({
        where: { id: session.id, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: user.id,
          closingCount: dto.closingCount,
          summary: full as unknown as Prisma.InputJsonValue,
          notes: [session.notes, dto.notes].filter(Boolean).join('\n') || null,
        },
      });
      if (!count) throw new ConflictException('La caja ya fue cerrada');
      return full;
    });

    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'cash.closed', entity: 'CashSession', entityId: session.id, data: { expected: closed.expected, counted, difference: closed.difference } });
    return this.detail(user, session.id, branch.id);
  }

  async sessions(user: AuthUser, branch: BranchContext, from?: string, to?: string) {
    const range = dayRange(from, to);
    const sessions = await this.prisma.cashSession.findMany({
      where: { tenantId: tenantOf(user), branchId: branch.id, openedAt: range },
      orderBy: { openedAt: 'desc' },
      include: { openedBy: { select: { fullName: true } }, closedBy: { select: { fullName: true } } },
    });
    return sessions;
  }

  async detail(user: AuthUser, id: string, branchId?: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { id, tenantId: tenantOf(user), branchId },
      include: {
        branch: { select: { name: true } },
        openedBy: { select: { fullName: true } },
        closedBy: { select: { fullName: true } },
        movements: { orderBy: { createdAt: 'asc' }, include: { category: true, createdBy: { select: { fullName: true } } } },
      },
    });
    if (!session) throw new NotFoundException('Caja no encontrada');
    const summary = session.status === 'CLOSED' && session.summary ? (session.summary as unknown as CashSummary) : await this.summary(session.id);
    return { session, summary, denominations: DENOMINATIONS };
  }

  /**
   * Bloquea la sesión dentro de una transacción. Las ventas usan bloqueo compartido y el cierre
   * bloqueo exclusivo, así una venta nunca queda registrada en una caja que se está cerrando.
   */
  async lockOpen(tx: Prisma.TransactionClient, sessionId: string, exclusive = false) {
    const rows = exclusive
      ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CashSession" WHERE id = ${sessionId} AND status = 'OPEN' FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CashSession" WHERE id = ${sessionId} AND status = 'OPEN' FOR SHARE`;
    if (!rows.length) throw new ConflictException('La caja fue cerrada. Abre una nueva caja');
  }

  async openSession(branchId: string) {
    const session = await this.prisma.cashSession.findFirst({ where: { branchId, status: 'OPEN' } });
    if (!session) throw new BadRequestException('No hay una caja abierta en esta sede');
    return session;
  }
}
