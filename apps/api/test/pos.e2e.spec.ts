import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, createSuperAdmin, resetDb, setupTenant } from './helpers';

type Client = Awaited<ReturnType<typeof setupTenant>>['admin'];

describe('Caja, POS, inventario y mesas', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let admin: Client;
  let branchId: string;
  let tenantId: string;
  let burger: { id: string; groups: { id: string; options: { id: string; name: string }[] }[] };
  let pan: string;
  let carne: string;

  const stock = async (itemId: string) =>
    Number((await prisma.stock.findUnique({ where: { itemId_branchId: { itemId, branchId } } }))?.quantity ?? 0);
  const option = (name: string) => burger.groups[0].options.find((o) => o.name === name)!.id;

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await createSuperAdmin(prisma);
    ({ admin, branchId, tenantId } = await setupTenant(app, ['tips', 'inventory', 'kitchen', 'tables']));
    pan = (await prisma.inventoryItem.create({ data: { tenantId, name: 'Pan', unit: 'und' } })).id;
    carne = (await prisma.inventoryItem.create({ data: { tenantId, name: 'Carne', unit: 'g' } })).id;
    const cat = await admin.post('/catalog/categories', { name: 'Hamburguesas' }).expect(201);
    const res = await admin
      .post('/catalog/products', {
        name: 'Hamburguesa',
        price: 15000,
        categoryId: cat.body.id,
        recipe: [{ inventoryItemId: pan, quantity: 1 }, { inventoryItemId: carne, quantity: 100 }],
        modifierGroups: [
          {
            name: 'Tamaño', minSelect: 1, maxSelect: 1,
            options: [
              { name: 'Normal', priceDelta: 0 },
              { name: 'Grande', priceDelta: 3000, recipe: [{ inventoryItemId: carne, quantity: 50 }] },
            ],
          },
        ],
      })
      .expect(201);
    burger = { id: res.body.id, groups: res.body.modifierGroups };
  });

  const sell = (overrides: object = {}) =>
    admin.post('/sales', {
      items: [{ productId: burger.id, quantity: 2, optionIds: [option('Grande')] }],
      tipAmount: 2000,
      tipMethod: 'QR_BOLD',
      payments: [
        { method: 'CASH', amount: 20000, received: 50000 },
        { method: 'QR_BOLD', amount: 18000, reference: 'BOLD-123' },
      ],
      ...overrides,
    });

  it('flujo completo: abrir caja, vender, gasto, anular y cerrar con cuadre', async () => {
    await sell().expect(400); // sin caja abierta

    const open = await admin.post('/cash/open', { openingAmount: 0, openingCount: { '50000': 1, '10000': 5 } }).expect(201);
    expect(open.body.openingAmount).toBe(100000);
    await admin.post('/cash/open', { openingAmount: 1000 }).expect(409); // una sola caja por sede

    const sale = await sell().expect(201);
    expect(sale.body.subtotal).toBe(36000);
    expect(sale.body.tipAmount).toBe(2000);
    expect(sale.body.payments.find((p: { method: string }) => p.method === 'CASH').change).toBe(30000);
    expect(await stock(pan)).toBe(-2);
    expect(await stock(carne)).toBe(-300);
    expect(await prisma.kitchenTicket.count({ where: { saleId: sale.body.id } })).toBe(1);

    const cats = await admin.get('/admin/expense-categories').expect(200);
    await admin.post('/cash/movements', { type: 'EXPENSE', amount: 5000, categoryId: cats.body[0].id, description: 'Hielo' }).expect(201);
    await admin.post('/cash/movements', { type: 'WITHDRAWAL', amount: 999999 }).expect(400);

    let current = await admin.get('/cash/current').expect(200);
    expect(current.body.summary.expected).toEqual({ CASH: 115000, TRANSFER: 0, QR_BOLD: 18000 });
    expect(current.body.summary.tips.QR_BOLD).toBe(2000);
    expect(current.body.summary.sales.QR_BOLD).toBe(16000);

    // Anular devuelve el inventario y saca la venta del cuadre.
    await admin.post(`/sales/${sale.body.id}/void`, { reason: 'Cliente se arrepintió' }).expect(201);
    await admin.post(`/sales/${sale.body.id}/void`, { reason: 'otra vez' }).expect(400);
    expect(await stock(pan)).toBe(0);
    expect(await stock(carne)).toBe(0);
    current = await admin.get('/cash/current').expect(200);
    expect(current.body.summary.expected.CASH).toBe(95000);
    expect(current.body.summary.voidedCount).toBe(1);

    const second = await sell({ tipAmount: 0, tipMethod: undefined, payments: [{ method: 'TRANSFER', amount: 36000 }] }).expect(201);
    const closed = await admin
      .post('/cash/close', { counted: { CASH: 0, TRANSFER: 36000, QR_BOLD: 0 }, closingCount: { '50000': 1, '20000': 2 } })
      .expect(201);
    expect(closed.body.summary.counted.CASH).toBe(90000);
    expect(closed.body.summary.difference).toEqual({ CASH: -5000, TRANSFER: 0, QR_BOLD: 0 });

    await sell().expect(400); // caja cerrada
    await admin.post(`/sales/${second.body.id}/void`, { reason: 'tarde' }).expect(400);
  });

  it('valida pagos, variantes obligatorias y propinas', async () => {
    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    await sell({ payments: [{ method: 'CASH', amount: 1000 }] }).expect(400);
    await sell({ items: [{ productId: burger.id, quantity: 1 }], tipAmount: 0, payments: [{ method: 'CASH', amount: 15000 }] }).expect(400);
    await sell({ tipMethod: 'TRANSFER' }).expect(400); // propina con un método no usado
    await sell({ payments: [{ method: 'CASH', amount: 38000, received: 10000 }] }).expect(400);
  });

  it('cuentas abiertas por mesa: una por mesa, agregar, cobrar y bloquear el cierre', async () => {
    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    const table = await admin.post(`/admin/branches/${branchId}/tables`, { name: 'Mesa 1' }).expect(201);
    const order = await admin
      .post('/orders', { tableId: table.body.id, items: [{ productId: burger.id, quantity: 1, optionIds: [option('Normal')] }] })
      .expect(201);
    await admin.post('/orders', { tableId: table.body.id, items: [{ productId: burger.id, quantity: 1, optionIds: [option('Normal')] }] }).expect(409);
    await admin.post(`/orders/${order.body.id}/items`, { items: [{ productId: burger.id, quantity: 1, optionIds: [option('Grande')] }] }).expect(201);
    expect(await stock(pan)).toBe(0); // se descuenta al cobrar

    await admin.post('/cash/close', { counted: { CASH: 0, TRANSFER: 0, QR_BOLD: 0 } }).expect(400);
    const paid = await admin.post(`/orders/${order.body.id}/pay`, { payments: [{ method: 'CASH', amount: 33000 }] }).expect(201);
    expect(paid.body.status).toBe('COMPLETED');
    expect(await stock(pan)).toBe(-2);
    expect(await stock(carne)).toBe(-250);
    await admin.post(`/orders/${order.body.id}/pay`, { payments: [{ method: 'CASH', amount: 33000 }] }).expect(400);
    await admin.post('/cash/close', { counted: { CASH: 33000, TRANSFER: 0, QR_BOLD: 0 } }).expect(201);
  });

  it('respeta los módulos apagados en la sede', async () => {
    await admin.put(`/admin/branches/${branchId}`, { name: 'Sede', activeModules: [] }).expect(200);
    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    await sell().expect(400); // propinas apagadas
    const sale = await sell({ tipAmount: 0, tipMethod: undefined, payments: [{ method: 'CASH', amount: 36000 }] }).expect(201);
    expect(await stock(pan)).toBe(0); // inventario apagado: no descuenta
    expect(await prisma.kitchenTicket.count({ where: { saleId: sale.body.id } })).toBe(0);
    await admin.get('/orders').expect(403);
  });
});
