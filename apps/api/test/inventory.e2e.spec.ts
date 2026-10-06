import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, createApp, createSuperAdmin, resetDb, setupTenant } from './helpers';

describe('Inventario, compras y traslados', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let ctx: Awaited<ReturnType<typeof setupTenant>>;
  let carne: string;

  const stockOf = async (branchId: string, itemId: string) => {
    const s = await prisma.stock.findUnique({ where: { itemId_branchId: { itemId, branchId } } });
    return { quantity: Number(s?.quantity ?? 0), avgCost: Number(s?.avgCost ?? 0) };
  };

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await createSuperAdmin(prisma);
    ctx = await setupTenant(app, ['inventory', 'purchases', 'transfers']);
    carne = (await ctx.admin.post('/inventory/items', { name: 'Carne', type: 'INGREDIENT', unit: 'g', minStock: 1000 }).expect(201)).body.id;
  });

  it('compras actualizan existencias y costo promedio ponderado', async () => {
    const sup = await ctx.admin.post('/suppliers', { name: 'Carnes del Valle' }).expect(201);
    await ctx.admin.post('/purchases', { supplierId: sup.body.id, invoiceNumber: 'F-1', items: [{ itemId: carne, quantity: 1000, unitCost: 30 }] }).expect(201);
    await ctx.admin.post('/purchases', { items: [{ itemId: carne, quantity: 1000, unitCost: 40 }] }).expect(201);
    expect(await stockOf(ctx.branchId, carne)).toEqual({ quantity: 2000, avgCost: 35 });

    const stock = await ctx.admin.get('/inventory/stock').expect(200);
    expect(stock.body[0]).toMatchObject({ quantity: 2000, value: 70000, low: false });
    const kardex = await ctx.admin.get(`/inventory/movements?itemId=${carne}`).expect(200);
    expect(kardex.body).toHaveLength(2);
  });

  it('compra pagada desde caja registra el gasto y valida el efectivo disponible', async () => {
    await ctx.admin.post('/purchases', { paidFromCash: true, items: [{ itemId: carne, quantity: 100, unitCost: 30 }] }).expect(400); // sin caja
    await ctx.admin.post('/cash/open', { openingAmount: 2000 }).expect(201);
    await ctx.admin.post('/purchases', { paidFromCash: true, items: [{ itemId: carne, quantity: 100, unitCost: 30 }] }).expect(400); // 3000 > 2000
    await ctx.admin.post('/purchases', { paidFromCash: true, items: [{ itemId: carne, quantity: 50, unitCost: 30 }] }).expect(201);
    const current = await ctx.admin.get('/cash/current').expect(200);
    expect(current.body.summary.expenses).toBe(1500);
    expect(current.body.summary.expected.CASH).toBe(500);
  });

  it('conteo físico, mermas y alertas de stock mínimo', async () => {
    await ctx.admin.post('/inventory/adjust', { mode: 'IN', lines: [{ itemId: carne, quantity: 3000, unitCost: 30 }] }).expect(201);
    await ctx.admin.post('/inventory/adjust', { mode: 'WASTE', note: 'Se dañó', lines: [{ itemId: carne, quantity: 200 }] }).expect(201);
    await ctx.admin.post('/inventory/adjust', { mode: 'COUNT', lines: [{ itemId: carne, quantity: 900 }] }).expect(201);
    expect((await stockOf(ctx.branchId, carne)).quantity).toBe(900);
    const stock = await ctx.admin.get('/inventory/stock').expect(200);
    expect(stock.body[0].low).toBe(true);
    const kardex = await ctx.admin.get(`/inventory/movements?itemId=${carne}`).expect(200);
    expect(kardex.body.map((m: { type: string; quantity: number }) => [m.type, m.quantity])).toEqual([
      ['ADJUSTMENT', -1900], ['WASTE', -200], ['INITIAL', 3000],
    ]);
  });

  it('traslado entre sedes: enviar, recibir con costo y cancelar', async () => {
    const sede2 = await ctx.admin.post('/admin/branches', { name: 'Sede Norte' }).expect(201);
    await ctx.admin.post('/inventory/adjust', { mode: 'IN', lines: [{ itemId: carne, quantity: 1000, unitCost: 30 }] }).expect(201);

    const t = await ctx.admin.post('/transfers', { toBranchId: sede2.body.id, items: [{ itemId: carne, quantity: 400 }] }).expect(201);
    expect((await stockOf(ctx.branchId, carne)).quantity).toBe(600);
    await ctx.admin.post(`/transfers/${t.body.id}/receive`).expect(400); // se recibe en destino

    const dest = client(app, ctx.token, sede2.body.id);
    await dest.post(`/transfers/${t.body.id}/receive`).expect(201);
    await dest.post(`/transfers/${t.body.id}/receive`).expect(400);
    expect(await stockOf(sede2.body.id, carne)).toEqual({ quantity: 400, avgCost: 30 });

    const t2 = await ctx.admin.post('/transfers', { toBranchId: sede2.body.id, items: [{ itemId: carne, quantity: 100 }] }).expect(201);
    await ctx.admin.post(`/transfers/${t2.body.id}/cancel`).expect(201);
    expect((await stockOf(ctx.branchId, carne)).quantity).toBe(600);
    const list = await ctx.admin.get('/transfers').expect(200);
    expect(list.body.map((x: { status: string }) => x.status).sort()).toEqual(['CANCELLED', 'RECEIVED']);
  });

  it('bloquea compras y traslados si el módulo no está habilitado', async () => {
    const other = await setupTenant(app, ['inventory'], 'solo-inv');
    await other.admin.get('/purchases').expect(403);
    await other.admin.get('/suppliers').expect(403);
    await other.admin.get('/transfers').expect(403);
    await other.admin.get('/inventory/stock').expect(200);
  });
});
