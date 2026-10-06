import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, createApp, createSuperAdmin, loginAs, resetDb, setupTenant } from './helpers';

describe('Cierre mensual', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let ctx: Awaited<ReturnType<typeof setupTenant>>;

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await createSuperAdmin(prisma);
    ctx = await setupTenant(app, ['reports', 'expenses']);
  });

  /** Mueve una caja y sus ventas/movimientos al día indicado (para simular meses pasados). */
  const moveSession = async (sessionId: string, day: string) => {
    const at = new Date(`${day}T15:00:00-05:00`);
    await prisma.cashSession.update({ where: { id: sessionId }, data: { openedAt: at, closedAt: at } });
    await prisma.sale.updateMany({ where: { cashSessionId: sessionId }, data: { createdAt: at, completedAt: at } });
    await prisma.cashMovement.updateMany({ where: { sessionId }, data: { createdAt: at } });
  };

  const daySale = async (day: string, amount: number, counted: number) => {
    const productId = (await ctx.admin.post('/catalog/products', { name: `P${day}`, price: amount }).expect(201)).body.id;
    const session = (await ctx.admin.post('/cash/open', { openingAmount: 0 }).expect(201)).body.id;
    await ctx.admin.post('/sales', { items: [{ productId, quantity: 1 }], payments: [{ method: 'CASH', amount }] }).expect(201);
    await ctx.admin.post('/cash/movements', { type: 'EXPENSE', method: 'TRANSFER', amount: 1000, description: 'Internet' }).expect(201);
    await ctx.admin.post('/cash/close', { counted: { CASH: counted, TRANSFER: 0, QR_BOLD: 0 } }).expect(201);
    await moveSession(session, day);
  };

  it('consolida los cierres diarios del mes, permite cerrarlo una vez y lo guarda', async () => {
    await daySale('2025-03-05', 50000, 50000);
    await daySale('2025-03-20', 30000, 28000); // faltante de 2.000

    const m = await ctx.admin.get('/cash/monthly?year=2025&month=3').expect(200);
    expect(m.body.closed).toBeNull();
    expect(m.body.totals).toMatchObject({ salesCount: 2, salesTotal: 80000, expenses: 2000, expensesTransfer: 2000 });
    expect(m.body.days).toHaveLength(2);
    expect(m.body.differences.CASH).toBe(-2000);
    expect(m.body.canClose).toBe(true);

    await ctx.admin.post('/cash/monthly/close', { year: 2025, month: 3, notes: 'Revisado con contador' }).expect(201);
    await ctx.admin.post('/cash/monthly/close', { year: 2025, month: 3 }).expect(409); // ya cerrado

    const closed = await ctx.admin.get('/cash/monthly?year=2025&month=3').expect(200);
    expect(closed.body.closed).toMatchObject({ notes: 'Revisado con contador' });
    expect(closed.body.totals.salesTotal).toBe(80000);
    const history = await ctx.admin.get('/cash/monthly/history').expect(200);
    expect(history.body[0]).toMatchObject({ year: 2025, month: 3, salesTotal: 80000, difference: -2000 });
  });

  it('no permite cerrar el mes en curso ni con cajas abiertas', async () => {
    const now = new Date(Date.now() - 5 * 3600_000);
    const current = await ctx.admin.get(`/cash/monthly?year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`).expect(200);
    expect(current.body.canClose).toBe(false);
    expect(current.body.blockers).toContain('El mes aún no ha terminado');

    const session = (await ctx.admin.post('/cash/open', { openingAmount: 0 }).expect(201)).body.id;
    await prisma.cashSession.update({ where: { id: session }, data: { openedAt: new Date('2025-04-10T15:00:00-05:00') } });
    const april = await ctx.admin.get('/cash/monthly?year=2025&month=4').expect(200);
    expect(april.body.canClose).toBe(false);
    await ctx.admin.post('/cash/monthly/close', { year: 2025, month: 4 }).expect(400);
    await ctx.admin.get('/cash/monthly?year=2025&month=13').expect(400);
  });

  it('gastos administrativos: no tocan la caja y entran al mes; se bloquean con el mes cerrado', async () => {
    await daySale('2025-05-10', 100000, 100000);
    const cats = await ctx.admin.get('/admin/expense-categories').expect(200);
    const arriendo = cats.body.find((c: { name: string }) => c.name === 'Arriendo');
    const exp = await ctx.admin.post('/expenses', { branchId: ctx.branchId, categoryId: arriendo.id, description: 'Arriendo local mayo', amount: 40000, method: 'TRANSFER', date: '2025-05-01' }).expect(201);
    await ctx.admin.post('/expenses', { description: 'Contador (general)', amount: 10000, method: 'TRANSFER', date: '2025-05-28' }).expect(201);

    const list = await ctx.admin.get('/expenses?from=2025-05-01&to=2025-05-31').expect(200);
    expect(list.body.map((e: { branchName: string }) => e.branchName).sort()).toEqual(['General', 'Sede principal']);

    const month = await ctx.admin.get('/cash/monthly?year=2025&month=5').expect(200);
    expect(month.body.adminExpenses.total).toBe(40000); // la sede no incluye los generales
    // ventas 100.000 − gastos de caja 1.000 (transferencia en caja) − administrativos 40.000
    expect(month.body.result).toBe(59000);
    expect(month.body.days[0].expected.CASH).toBe(100000); // la caja diaria no cambia

    const all = await ctx.admin.get('/cash/monthly/consolidated?year=2025&month=5').expect(200);
    expect(all.body.adminExpenses).toMatchObject({ total: 50000, general: 10000 });
    expect(all.body.result).toBe(49000);

    await ctx.admin.post('/cash/monthly/close', { year: 2025, month: 5 }).expect(201);
    await ctx.admin.put(`/expenses/${exp.body.id}`, { branchId: ctx.branchId, description: 'cambio', amount: 1, method: 'CASH', date: '2025-05-01' }).expect(400);
    await ctx.admin.post('/expenses', { branchId: ctx.branchId, description: 'tarde', amount: 1, method: 'CASH', date: '2025-05-15' }).expect(400);
    await ctx.admin.delete(`/expenses/${exp.body.id}`).expect(400);
  });

  it('reabrir un mes cerrado: solo el administrador, con motivo y queda en auditoría', async () => {
    await daySale('2025-06-03', 20000, 20000);
    await ctx.admin.post('/cash/monthly/close', { year: 2025, month: 6 }).expect(201);

    const roles = await ctx.admin.get('/admin/roles').expect(200);
    const sedeRole = roles.body.roles.find((r: { name: string }) => r.name === 'Administrador de sede');
    expect(sedeRole.permissions).toContain('cash.monthly');
    expect(sedeRole.permissions).not.toContain('cash.monthly_reopen');
    await ctx.admin.post('/admin/users', { fullName: 'Sede', username: 'sede@negocio.com', password: 'Secreta123!', roleId: sedeRole.id, branchIds: [ctx.branchId] }).expect(201);
    const sede = client(app, await loginAs(app, 'sede@negocio.com'), ctx.branchId);
    await sede.post('/cash/monthly/reopen', { year: 2025, month: 6, reason: 'Corregir gasto' }).expect(403);
    await sede.get('/cash/monthly/consolidated?year=2025&month=6').expect(403);

    await ctx.admin.post('/cash/monthly/reopen', { year: 2025, month: 6, reason: 'x' }).expect(400);
    const reopened = await ctx.admin.post('/cash/monthly/reopen', { year: 2025, month: 6, reason: 'Corregir gasto de arriendo' }).expect(201);
    expect(reopened.body.closed).toBeNull();
    await ctx.admin.post('/cash/monthly/reopen', { year: 2025, month: 6, reason: 'otra vez' }).expect(404);
    const log = await prisma.auditLog.findFirst({ where: { action: 'cash.monthly_reopened' } });
    expect(log?.data).toMatchObject({ reason: 'Corregir gasto de arriendo', sales: 20000 });
    await ctx.admin.post('/cash/monthly/close', { year: 2025, month: 6 }).expect(201); // se puede volver a cerrar
  });

  it('consolidado de todas las sedes muestra cuáles cerraron', async () => {
    const sede2 = await ctx.admin.post('/admin/branches', { name: 'Sede Norte' }).expect(201);
    await daySale('2025-07-02', 30000, 30000);
    const other = client(app, ctx.token, sede2.body.id);
    const productId = (await other.post('/catalog/products', { name: 'Jugo', price: 8000 }).expect(201)).body.id;
    const s2 = (await other.post('/cash/open', { openingAmount: 0 }).expect(201)).body.id;
    await other.post('/sales', { items: [{ productId, quantity: 2 }], payments: [{ method: 'QR_BOLD', amount: 16000 }] }).expect(201);
    await other.post('/cash/close', { counted: { CASH: 0, TRANSFER: 0, QR_BOLD: 15000 } }).expect(201);
    await moveSession(s2, '2025-07-09');
    await ctx.admin.post('/cash/monthly/close', { year: 2025, month: 7 }).expect(201);

    const all = await ctx.admin.get('/cash/monthly/consolidated?year=2025&month=7').expect(200);
    expect(all.body.totals.salesTotal).toBe(46000);
    expect(all.body.totalDifference).toBe(-1000);
    expect(all.body.allClosed).toBe(false);
    const norte = all.body.branches.find((b: { name: string }) => b.name === 'Sede Norte');
    expect(norte).toMatchObject({ salesTotal: 16000, difference: -1000, closed: null });
    expect(all.body.branches.find((b: { name: string }) => b.name !== 'Sede Norte').closed).not.toBeNull();
  });
});
