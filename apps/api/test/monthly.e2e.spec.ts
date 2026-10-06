import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, createSuperAdmin, resetDb, setupTenant } from './helpers';

describe('Cierre mensual', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let ctx: Awaited<ReturnType<typeof setupTenant>>;

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await createSuperAdmin(prisma);
    ctx = await setupTenant(app, ['reports']);
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
});
