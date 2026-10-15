import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, createSuperAdmin, resetDb, setupTenant } from './helpers';

describe('Gastos fijos y carga de ventas por Excel', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let ctx: Awaited<ReturnType<typeof setupTenant>>;

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await createSuperAdmin(prisma);
    ctx = await setupTenant(app, ['expenses', 'reports', 'inventory']);
  });

  it('gastos fijos: se crean, se registran una vez por mes y se pueden registrar todos', async () => {
    const cat = await ctx.admin.post('/admin/expense-categories', { name: 'Arrendamiento' }).expect(201);
    const rent = await ctx.admin.post('/expenses/recurring', { categoryId: cat.body.id, description: 'Arriendo local', amount: 2_000_000, method: 'TRANSFER', dayOfMonth: 5 }).expect(201);
    await ctx.admin.post('/expenses/recurring', { branchId: ctx.branchId, description: 'Internet', amount: 120_000, method: 'TRANSFER', dayOfMonth: 10 }).expect(201);
    await ctx.admin.post('/expenses/recurring', { description: 'Malo', amount: 1, method: 'TRANSFER', dayOfMonth: 31 }).expect(400);

    let list = (await ctx.admin.get('/expenses/recurring?month=2026-09').expect(200)).body;
    expect(list.items).toHaveLength(3 - 1);
    expect(list.items.every((i: { registered: unknown }) => i.registered === null)).toBe(true);

    const one = await ctx.admin.post(`/expenses/recurring/${rent.body.id}/register`, { month: '2026-09', amount: 2_100_000 }).expect(201);
    expect(one.body).toMatchObject({ amount: 2_100_000, description: 'Arriendo local · septiembre 2026', recurringId: rent.body.id });
    await ctx.admin.post(`/expenses/recurring/${rent.body.id}/register`, { month: '2026-09' }).expect(400);
    expect((await ctx.admin.post('/expenses/recurring/register-all', { month: '2026-09' }).expect(201)).body).toEqual({ registered: 1, total: 120_000 });
    expect((await ctx.admin.post('/expenses/recurring/register-all', { month: '2026-09' }).expect(201)).body).toEqual({ registered: 0, total: 0 });

    list = (await ctx.admin.get('/expenses/recurring?month=2026-09').expect(200)).body;
    expect(list.items.map((i: { registered: { amount: number } }) => i.registered.amount).sort()).toEqual([120_000, 2_100_000]);
    const expenses = (await ctx.admin.get('/expenses?from=2026-09-01&to=2026-09-30').expect(200)).body;
    expect(expenses).toHaveLength(2);

    await ctx.admin.delete(`/expenses/recurring/${rent.body.id}`).expect(204);
    expect((await ctx.admin.get('/expenses?from=2026-09-01&to=2026-09-30').expect(200)).body).toHaveLength(2); // los registrados se conservan
  });

  it('carga de ventas por Excel: plantilla, validación por fila, carga y deshacer', async () => {
    const p1 = (await ctx.admin.post('/catalog/products', { name: 'Granizado', price: 8000 }).expect(201)).body;
    const p2 = (await ctx.admin.post('/catalog/products', { name: 'Agua', price: 3000, code: 'agua-1' }).expect(201)).body;
    expect(p1.code).toBe('P001');
    expect(p2.code).toBe('AGUA-1');
    await ctx.admin.post('/catalog/products', { name: 'Otra', price: 1, code: 'AGUA-1' }).expect(400);

    const tpl = await ctx.admin.get('/sales-import/template').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    const wbTpl = new ExcelJS.Workbook();
    await wbTpl.xlsx.load(tpl.body);
    expect(wbTpl.worksheets.map((w) => w.name)).toEqual(['Ventas', 'Productos', 'Instrucciones']);
    expect(wbTpl.getWorksheet('Productos')!.getRow(2).getCell(1).value).toBeTruthy();

    const file = async (rows: unknown[][]) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Ventas');
      ws.addRow(['Fecha', 'Código', 'Cantidad', 'Método', 'Valor']);
      rows.forEach((r) => ws.addRow(r));
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    const upload = async (rows: unknown[][]) => ctx.admin.post('/sales-import').attach('file', await file(rows), 'ventas.xlsx');

    const bad = await upload([
      ['2026-09-10', 'P001', 2, 'Efectivo', 16000],
      ['2999-01-01', 'NOPE', 0, 'cheque', -1],
    ]);
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toHaveLength(1);
    expect(bad.body.errors[0]).toContain('Fila 3');
    expect(await prisma.sale.count()).toBe(0);

    const ok = await upload([
      ['2026-09-10', 'p001', 2, 'Efectivo', 15000],
      [new Date(Date.UTC(2026, 8, 11)), 'AGUA-1', 3, 'nequi', '9.000'],
      ['12/09/2026', 'P001', 1, 'QR Bold', 8000],
    ]);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ rowCount: 3, total: 32000 });
    const sales = await prisma.sale.findMany({ include: { items: true, payments: true }, orderBy: { number: 'asc' } });
    expect(sales.map((s) => [s.completedAt!.toISOString().slice(0, 10), s.subtotal, s.payments[0].method, s.cashSessionId])).toEqual([
      ['2026-09-10', 15000, 'CASH', null], ['2026-09-11', 9000, 'TRANSFER', null], ['2026-09-12', 8000, 'QR_BOLD', null],
    ]);
    expect(await prisma.stockMovement.count()).toBe(0); // no descuenta inventario

    const report = (await ctx.admin.get('/reports/summary?from=2026-09-01&to=2026-09-30').expect(200)).body;
    expect(report.totals).toMatchObject({ salesCount: 3, salesTotal: 32000 });

    const imports = (await ctx.admin.get('/sales-import').expect(200)).body;
    expect(imports).toHaveLength(1);
    await ctx.admin.delete(`/sales-import/${imports[0].id}`).expect(204);
    expect(await prisma.sale.count()).toBe(0);
  });
});
