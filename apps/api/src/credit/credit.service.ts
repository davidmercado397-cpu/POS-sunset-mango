import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashService } from '../cash/cash.service';
import { AuthUser, BranchContext } from '../common/auth-user';
import { dayRange, tenantOf } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { ReceivablePaymentDto } from './credit.dto';

const DETAIL = {
  sale: {
    select: {
      id: true, number: true, subtotal: true, discount: true, createdAt: true, customerName: true, status: true,
      items: { orderBy: { createdAt: 'asc' }, select: { id: true, productName: true, quantity: true, lineTotal: true } },
      payments: { select: { method: true, amount: true } },
    },
  },
  createdBy: { select: { fullName: true } },
  payments: { orderBy: { paidAt: 'asc' }, include: { createdBy: { select: { fullName: true } } } },
} satisfies Prisma.ReceivableInclude;

/** Ventas a crédito (fiado): cuentas por cobrar de la sede y sus pagos. */
@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cash: CashService,
  ) {}

  async list(user: AuthUser, branch: BranchContext, status = 'PENDING', q?: string) {
    const where: Prisma.ReceivableWhereInput = { tenantId: tenantOf(user), branchId: branch.id };
    if (status === 'PENDING' || status === 'PAID' || status === 'CANCELLED') where.status = status;
    else where.status = { not: 'CANCELLED' };
    if (q?.trim()) where.debtorName = { contains: q.trim(), mode: 'insensitive' };
    const [rows, pending] = await Promise.all([
      this.prisma.receivable.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { sale: { select: { number: true } }, createdBy: { select: { fullName: true } } },
      }),
      this.prisma.receivable.aggregate({
        where: { tenantId: tenantOf(user), branchId: branch.id, status: 'PENDING' },
        _sum: { amount: true, paidAmount: true },
        _count: true,
      }),
    ]);
    return {
      receivables: rows.map((r) => ({ ...r, balance: r.amount - r.paidAmount })),
      pending: { count: pending._count, balance: (pending._sum.amount ?? 0) - (pending._sum.paidAmount ?? 0) },
    };
  }

  async detail(user: AuthUser, branch: BranchContext, id: string) {
    const r = await this.prisma.receivable.findFirst({ where: { id, tenantId: tenantOf(user), branchId: branch.id }, include: DETAIL });
    if (!r) throw new NotFoundException('Cuenta por cobrar no encontrada');
    return { ...r, balance: r.amount - r.paidAmount };
  }

  /** Registra un pago o abono. El dinero entra a la caja abierta de la sede. */
  async pay(user: AuthUser, branch: BranchContext, id: string, dto: ReceivablePaymentDto) {
    const tenantId = tenantOf(user);
    const session = await this.cash.openSession(branch.id);
    const paidAt = this.paymentDate(dto.paidAt);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.cash.lockOpen(tx, session.id);
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Receivable" WHERE id = ${id} AND "tenantId" = ${tenantId} AND "branchId" = ${branch.id} FOR UPDATE`;
      if (!row) throw new NotFoundException('Cuenta por cobrar no encontrada');
      const r = await tx.receivable.findUniqueOrThrow({ where: { id } });
      if (r.status !== 'PENDING') throw new BadRequestException(r.status === 'PAID' ? 'Esta cuenta ya está pagada' : 'Esta cuenta fue anulada');
      const balance = r.amount - r.paidAmount;
      if (dto.amount > balance) throw new BadRequestException(`El pago supera el saldo pendiente (${balance.toLocaleString('es-CO')})`);
      if (paidAt < dayRange(r.createdAt.toISOString().slice(0, 10)).gte) {
        throw new BadRequestException('La fecha del pago no puede ser anterior a la venta');
      }
      await tx.receivablePayment.create({
        data: {
          receivableId: id, cashSessionId: session.id, method: dto.method, amount: dto.amount, paidAt,
          reference: dto.reference?.trim() || null, notes: dto.notes?.trim() || null, createdById: user.id,
        },
      });
      const paidAmount = r.paidAmount + dto.amount;
      const settled = paidAmount === r.amount;
      await tx.receivable.update({
        where: { id },
        data: { paidAmount, ...(settled ? { status: 'PAID', paidAt } : {}) },
      });
      return { debtorName: r.debtorName, settled, balance: r.amount - paidAmount };
    });
    await this.audit.log({
      tenantId, branchId: branch.id, userId: user.id, action: 'credit.payment', entity: 'Receivable', entityId: id,
      data: { debtorName: result.debtorName, amount: dto.amount, method: dto.method, settled: result.settled },
    });
    return this.detail(user, branch, id);
  }

  /** Hoy → hora actual; otro día → mediodía de ese día (hora de Colombia). No se aceptan fechas futuras. */
  private paymentDate(value?: string): Date {
    const today = dayRange();
    if (!value) return new Date();
    const day = dayRange(value).gte;
    if (day >= today.lt) throw new BadRequestException('La fecha del pago no puede ser futura');
    return day.getTime() === today.gte.getTime() ? new Date() : new Date(day.getTime() + 12 * 3600_000);
  }
}
