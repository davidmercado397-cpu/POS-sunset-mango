import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, createApp, createSuperAdmin, loginAs, resetDb, setupTenant } from './helpers';

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

  it('el administrador corrige entradas y mermas, y fija el costo promedio', async () => {
    const vasos = (await ctx.admin.post('/inventory/items', { name: 'Vasos', type: 'PRODUCT', unit: 'und' }).expect(201)).body.id;
    // Entrada cargada sin precio y con cantidad equivocada.
    await ctx.admin.post('/inventory/adjust', { mode: 'IN', lines: [{ itemId: vasos, quantity: 10 }] }).expect(201);
    await ctx.admin.post('/inventory/adjust', { mode: 'WASTE', lines: [{ itemId: vasos, quantity: 2 }] }).expect(201);
    expect(await stockOf(ctx.branchId, vasos)).toEqual({ quantity: 8, avgCost: 0 });

    const kardex = async () => (await ctx.admin.get(`/inventory/movements?itemId=${vasos}`).expect(200)).body;
    const [waste, entry] = await kardex();
    await ctx.admin.patch(`/inventory/movements/${entry.id}`, { unitCost: 500 }).expect(400); // falta el motivo
    await ctx.admin.patch(`/inventory/movements/${entry.id}`, { quantity: 12, unitCost: 500, reason: 'Llegaron 12 y no se puso precio' }).expect(200);
    expect(await stockOf(ctx.branchId, vasos)).toEqual({ quantity: 10, avgCost: 500 });
    let rows = await kardex();
    expect(rows.map((m: { quantity: number; balanceAfter: number }) => [m.quantity, m.balanceAfter])).toEqual([[-2, 10], [12, 12]]);
    expect(rows[1].note).toContain('Corregido');

    await ctx.admin.patch(`/inventory/movements/${waste.id}`, { quantity: 1, reason: 'Solo se rompió uno' }).expect(200);
    await ctx.admin.patch(`/inventory/movements/${waste.id}`, { unitCost: 10, reason: 'no aplica' }).expect(400);
    expect((await stockOf(ctx.branchId, vasos)).quantity).toBe(11);
    rows = await kardex();
    expect(rows[0].balanceAfter).toBe(11);

    // Un conteo físico no se edita: se hace otro conteo.
    await ctx.admin.post('/inventory/adjust', { mode: 'COUNT', lines: [{ itemId: vasos, quantity: 9 }] }).expect(201);
    const count = (await kardex())[0];
    await ctx.admin.patch(`/inventory/movements/${count.id}`, { quantity: 1, reason: 'error' }).expect(400);

    await ctx.admin.put(`/inventory/stock/${vasos}/cost`, { avgCost: 650, reason: 'Precio actualizado' }).expect(200);
    expect((await stockOf(ctx.branchId, vasos)).avgCost).toBe(650);
    expect(await prisma.auditLog.count({ where: { action: { in: ['inventory.movement_corrected', 'inventory.cost_set'] } } })).toBe(3);

    // Sin el permiso de corrección (administrador de sede) no se puede.
    const roles = await ctx.admin.get('/admin/roles').expect(200);
    const sede = roles.body.roles.find((r: { name: string }) => r.name === 'Administrador de sede');
    expect(sede.permissions).not.toContain('inventory.edit');
    await ctx.admin.post('/admin/users', { fullName: 'Sede', username: 'sede@inv.com', password: 'Secreta123!', roleId: sede.id, branchIds: [ctx.branchId] }).expect(201);
    const other = client(app, await loginAs(app, 'sede@inv.com'), ctx.branchId);
    await other.put(`/inventory/stock/${vasos}/cost`, { avgCost: 1 }).expect(403);
  });

  it('el administrador elimina ítems inactivos sin movimientos ni recetas', async () => {
    const make = async (name: string) => (await ctx.admin.post('/inventory/items', { name, type: 'INGREDIENT', unit: 'und' }).expect(201)).body.id as string;
    const deactivate = (id: string, name: string) => ctx.admin.put(`/inventory/items/${id}`, { name, type: 'INGREDIENT', unit: 'und', isActive: false }).expect(200);
    const libre = await make('Pitillos');
    const usado = await make('Servilletas');
    const enReceta = await make('Salsa');

    // Activo: hay que desactivarlo primero.
    await ctx.admin.delete(`/inventory/items/${libre}`).expect(400);
    await deactivate(libre, 'Pitillos');

    await ctx.admin.post('/inventory/adjust', { mode: 'IN', lines: [{ itemId: usado, quantity: 5 }] }).expect(201);
    await deactivate(usado, 'Servilletas');
    await ctx.admin.post('/catalog/products', { name: 'Perro', price: 8000, recipe: [{ inventoryItemId: enReceta, quantity: 1 }] }).expect(201);
    await deactivate(enReceta, 'Salsa');

    const items = (await ctx.admin.get('/inventory/items').expect(200)).body as { id: string; movementCount: number; recipeCount: number }[];
    expect(items.find((i) => i.id === usado)).toMatchObject({ movementCount: 1, recipeCount: 0 });
    expect(items.find((i) => i.id === enReceta)).toMatchObject({ movementCount: 0, recipeCount: 1 });

    // Sin el permiso (administrador de sede) no puede.
    const roles = await ctx.admin.get('/admin/roles').expect(200);
    const sede = roles.body.roles.find((r: { name: string }) => r.name === 'Administrador de sede');
    expect(sede.permissions).not.toContain('inventory.delete');
    await ctx.admin.post('/admin/users', { fullName: 'Sede', username: 'sede2@inv.com', password: 'Secreta123!', roleId: sede.id, branchIds: [ctx.branchId] }).expect(201);
    const other = client(app, await loginAs(app, 'sede2@inv.com'), ctx.branchId);
    await other.delete(`/inventory/items/${libre}`).expect(403);

    const res = await ctx.admin.delete(`/inventory/items/${usado}`).expect(400);
    expect(res.body.message).toContain('movimientos');
    expect((await ctx.admin.delete(`/inventory/items/${enReceta}`).expect(400)).body.message).toContain('Perro');
    await ctx.admin.delete(`/inventory/items/${libre}`).expect(204);
    await ctx.admin.delete(`/inventory/items/${libre}`).expect(404);

    expect(await prisma.inventoryItem.count({ where: { id: { in: [usado, enReceta] } } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'inventory.item_deleted' } })).toBe(1);
  });
});
