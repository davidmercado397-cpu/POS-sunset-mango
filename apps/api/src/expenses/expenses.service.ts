import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { dayRange, tenantOf } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AdminExpenseDto, RecurringExpenseDto, RegisterRecurringDto } from './expenses.dto';

/** Fecha contable a mediodía de Colombia para que no cambie de día por zona horaria. */
const toDate = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00-05:00`);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
  ) {}

  /** Lista por rango. `branch`: 'all' (todo), 'general' (sin sede) o el id de una sede. */
  async list(user: AuthUser, from?: string, to?: string, branch?: string) {
    const tenantId = tenantOf(user);
    const where: Prisma.AdminExpenseWhereInput = { tenantId, date: dayRange(from, to) };
    if (branch === 'general') where.branchId = null;
    else if (branch && branch !== 'all') where.branchId = branch;
    const rows = await this.prisma.adminExpense.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: { category: true } });
    const branches = await this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const names = new Map(branches.map((b) => [b.id, b.name]));
    return rows.map((r) => ({ ...r, branchName: r.branchId ? names.get(r.branchId) ?? '' : 'General' }));
  }

  async save(user: AuthUser, dto: AdminExpenseDto, id?: string, recurringId?: string) {
    const tenantId = tenantOf(user);
    if (dto.branchId && !(await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId } }))) throw new BadRequestException('Sede inválida');
    if (dto.categoryId && !(await this.prisma.expenseCategory.findFirst({ where: { id: dto.categoryId, tenantId } }))) throw new BadRequestException('Categoría inválida');
    await this.assertMonthOpen(tenantId, dto.branchId ?? null, dto.date);
    const data = {
      branchId: dto.branchId || null,
      categoryId: dto.categoryId || null,
      description: dto.description.trim(),
      amount: dto.amount,
      method: dto.method,
      date: toDate(dto.date),
      reference: dto.reference?.trim() || null,
    };
    let expense;
    if (id) {
      const found = await this.find(tenantId, id);
      await this.assertMonthOpen(tenantId, found.branchId, found.date.toISOString());
      expense = await this.prisma.adminExpense.update({ where: { id }, data });
    } else {
      expense = await this.prisma.adminExpense.create({ data: { ...data, tenantId, createdById: user.id, recurringId: recurringId ?? null } });
    }
    await this.audit.log({ tenantId, branchId: data.branchId, userId: user.id, action: id ? 'expense.updated' : 'expense.created', entity: 'AdminExpense', entityId: expense.id, data: { amount: data.amount, description: data.description } });
    return expense;
  }

  async remove(user: AuthUser, id: string) {
    const tenantId = tenantOf(user);
    const found = await this.find(tenantId, id);
    await this.assertMonthOpen(tenantId, found.branchId, found.date.toISOString());
    await this.prisma.adminExpense.delete({ where: { id } });
    await this.uploads.remove(tenantId, found.receiptUrl);
    await this.audit.log({ tenantId, branchId: found.branchId, userId: user.id, action: 'expense.deleted', entity: 'AdminExpense', entityId: id, data: { amount: found.amount, description: found.description } });
  }

  async uploadReceipt(user: AuthUser, id: string, file: Express.Multer.File | undefined) {
    const tenantId = tenantOf(user);
    const found = await this.find(tenantId, id);
    const url = await this.uploads.saveImage(tenantId, file, 1400);
    await this.prisma.adminExpense.update({ where: { id }, data: { receiptUrl: url } });
    await this.uploads.remove(tenantId, found.receiptUrl);
    return { receiptUrl: url };
  }

  // ───────── Gastos fijos (recurrentes) ─────────

  /** Gastos fijos con su estado en el mes indicado (AAAA-MM): registrado o pendiente. */
  async recurring(user: AuthUser, month?: string) {
    const tenantId = tenantOf(user);
    const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);
    const range = this.monthRange(ym);
    const [rows, branches] = await Promise.all([
      this.prisma.recurringExpense.findMany({
        where: { tenantId },
        orderBy: [{ isActive: 'desc' }, { dayOfMonth: 'asc' }, { description: 'asc' }],
        include: { category: true, expenses: { where: { date: range }, select: { id: true, amount: true, date: true } } },
      }),
      this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);
    const names = new Map(branches.map((b) => [b.id, b.name]));
    return {
      month: ym,
      items: rows.map(({ expenses, ...r }) => ({
        ...r,
        branchName: r.branchId ? names.get(r.branchId) ?? '' : 'General',
        registered: expenses[0] ?? null,
      })),
    };
  }

  async saveRecurring(user: AuthUser, dto: RecurringExpenseDto, id?: string) {
    const tenantId = tenantOf(user);
    if (dto.branchId && !(await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId } }))) throw new BadRequestException('Sede inválida');
    if (dto.categoryId && !(await this.prisma.expenseCategory.findFirst({ where: { id: dto.categoryId, tenantId } }))) throw new BadRequestException('Categoría inválida');
    const data = {
      branchId: dto.branchId || null,
      categoryId: dto.categoryId || null,
      description: dto.description.trim(),
      amount: dto.amount,
      method: dto.method,
      dayOfMonth: dto.dayOfMonth,
      isActive: dto.isActive ?? true,
    };
    if (id) {
      await this.findRecurring(tenantId, id);
      return this.prisma.recurringExpense.update({ where: { id }, data });
    }
    return this.prisma.recurringExpense.create({ data: { ...data, tenantId } });
  }

  async removeRecurring(user: AuthUser, id: string) {
    const tenantId = tenantOf(user);
    await this.findRecurring(tenantId, id);
    // Los gastos ya registrados se conservan (quedan sin vínculo).
    await this.prisma.recurringExpense.delete({ where: { id } });
  }

  /** Registra el gasto fijo como gasto administrativo del mes (una sola vez por mes). */
  async registerRecurring(user: AuthUser, id: string, dto: RegisterRecurringDto) {
    const tenantId = tenantOf(user);
    const r = await this.findRecurring(tenantId, id);
    return this.registerOne(user, r, dto.month, dto.amount);
  }

  /** Registra todos los gastos fijos activos que falten en el mes. */
  async registerAllRecurring(user: AuthUser, dto: RegisterRecurringDto) {
    const tenantId = tenantOf(user);
    const range = this.monthRange(dto.month);
    const pending = await this.prisma.recurringExpense.findMany({
      where: { tenantId, isActive: true, expenses: { none: { date: range } } },
    });
    const created = [];
    for (const r of pending) created.push(await this.registerOne(user, r, dto.month));
    return { registered: created.length, total: created.reduce((s, e) => s + e.amount, 0) };
  }

  private async registerOne(user: AuthUser, r: { id: string; tenantId: string; branchId: string | null; categoryId: string | null; description: string; amount: number; method: AdminExpenseDto['method']; dayOfMonth: number }, month: string, amount?: number) {
    const day = `${month}-${String(r.dayOfMonth).padStart(2, '0')}`;
    if (await this.prisma.adminExpense.findFirst({ where: { recurringId: r.id, date: this.monthRange(month) } })) {
      throw new BadRequestException(`"${r.description}" ya está registrado en ese mes`);
    }
    const [y, m] = month.split('-');
    return this.save(user, {
      branchId: r.branchId, categoryId: r.categoryId, description: `${r.description} · ${MONTHS[Number(m) - 1]} ${y}`,
      amount: amount ?? r.amount, method: r.method, date: day,
    }, undefined, r.id);
  }

  private monthRange(month: string) {
    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    return { gte: new Date(`${month}-01T00:00:00-05:00`), lt: new Date(`${next}-01T00:00:00-05:00`) };
  }

  private async findRecurring(tenantId: string, id: string) {
    const found = await this.prisma.recurringExpense.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Gasto fijo no encontrado');
    return found;
  }

  private async find(tenantId: string, id: string) {
    const found = await this.prisma.adminExpense.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Gasto no encontrado');
    return found;
  }

  /**
   * No se modifican gastos de un mes ya cerrado. Un gasto de sede se bloquea si esa sede cerró el mes;
   * un gasto general, si cualquier sede lo cerró.
   */
  private async assertMonthOpen(tenantId: string, branchId: string | null, day: string) {
    const date = toDate(day);
    const year = Number(day.slice(0, 4));
    const month = Number(day.slice(5, 7));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Fecha inválida');
    const closed = await this.prisma.monthlyClose.findFirst({ where: { tenantId, year, month, ...(branchId ? { branchId } : {}) } });
    if (closed) throw new BadRequestException('Ese mes ya fue cerrado. Pide al administrador que lo reabra para hacer cambios');
  }
}
