import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, createApp, createSuperAdmin, loginAs, resetDb, setupTenant } from './helpers';

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
    ({ admin, branchId, tenantId } = await setupTenant(app, ['tips', 'inventory', 'kitchen', 'tables', 'reports']));
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
    // Gasto pagado por transferencia: se registra, pero no descuenta el efectivo de la caja.
    await admin.post('/cash/movements', { type: 'EXPENSE', method: 'TRANSFER', amount: 999999, description: 'Arriendo' }).expect(201);
    await admin.post('/cash/movements', { type: 'WITHDRAWAL', method: 'TRANSFER', amount: 100 }).expect(400);

    let current = await admin.get('/cash/current').expect(200);
    expect(current.body.summary.expected).toEqual({ CASH: 115000, TRANSFER: 0, QR_BOLD: 18000 });
    expect(current.body.summary.tips.QR_BOLD).toBe(2000);
    expect(current.body.summary.sales.QR_BOLD).toBe(16000);
    expect(current.body.summary.expensesTransfer).toBe(999999);

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
    const added = await admin.post(`/orders/${order.body.id}/items`, { items: [{ productId: burger.id, quantity: 1, optionIds: [option('Grande')] }, { productId: burger.id, quantity: 3, optionIds: [option('Normal')] }] }).expect(201);
    // El mesero (solo con permiso de mesas) puede quitar productos ya enviados.
    const roles = await admin.get('/admin/roles').expect(200);
    const mesero = roles.body.roles.find((r: { name: string }) => r.name === 'Mesero');
    expect(mesero.permissions).not.toContain('sales.void');
    await admin.post('/admin/users', { fullName: 'Mesero', username: 'mesero@negocio.com', password: 'Secreta123!', roleId: mesero.id, branchIds: [branchId] }).expect(201);
    const meseroClient = client(app, await loginAs(app, 'MESERO@negocio.com'), branchId);
    const extra = added.body.items.find((i: { quantity: number }) => i.quantity === 3);
    await meseroClient.delete(`/orders/${order.body.id}/items/${extra.id}`).expect(200);
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

  it('reportes: totales, métodos, productos y costo de lo vendido', async () => {
    await admin.post('/inventory/adjust', { mode: 'IN', lines: [{ itemId: pan, quantity: 10, unitCost: 1000 }, { itemId: carne, quantity: 1000, unitCost: 20 }] }).expect(201);
    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    await sell().expect(201); // 2 grandes: costo = 2*1000 + 300*20 = 8000
    const voided = await sell({ tipAmount: 0, tipMethod: undefined, payments: [{ method: 'CASH', amount: 36000 }] }).expect(201);
    await admin.post(`/sales/${voided.body.id}/void`, { reason: 'error' }).expect(201);

    const r = await admin.get('/reports/summary').expect(200);
    expect(r.body.totals).toMatchObject({ salesCount: 1, salesTotal: 36000, tips: 2000, voidedCount: 1, cost: 8000, grossProfit: 28000 });
    expect(r.body.byMethod).toEqual([
      { method: 'CASH', sales: 20000, tips: 0 },
      { method: 'TRANSFER', sales: 0, tips: 0 },
      { method: 'QR_BOLD', sales: 16000, tips: 2000 },
    ]);
    expect(r.body.topProducts[0]).toMatchObject({ name: 'Hamburguesa', quantity: 2, total: 36000, category: 'Hamburguesas' });

    const margins = await admin.get('/reports/margins').expect(200);
    expect(margins.body[0]).toMatchObject({ price: 15000, cost: 3000, margin: 12000 });
    await admin.get('/reports/summary?scope=all').expect(200);
  });

  it('combos: descuentan cada producto incluido y muestran el detalle en cocina', async () => {
    const papa = (await prisma.inventoryItem.create({ data: { tenantId, name: 'Papa', unit: 'g' } })).id;
    const gaseosaItem = (await prisma.inventoryItem.create({ data: { tenantId, name: 'Gaseosa 400', unit: 'und', type: 'PRODUCT' } })).id;
    const papas = (await admin.post('/catalog/products', { name: 'Papas', price: 6000, recipe: [{ inventoryItemId: papa, quantity: 200 }] }).expect(201)).body.id;
    const gaseosa = (await admin.post('/catalog/products', { name: 'Gaseosa', price: 4000, sendToKitchen: false, recipe: [{ inventoryItemId: gaseosaItem, quantity: 1 }] }).expect(201)).body.id;

    await admin.post('/catalog/products', { name: 'Combo vacío', price: 1, isCombo: true, comboItems: [] }).expect(400);
    const combo = await admin
      .post('/catalog/products', {
        name: 'Combo Clásico', price: 22000, isCombo: true,
        comboItems: [{ productId: burger.id, quantity: 1 }, { productId: papas, quantity: 1 }, { productId: gaseosa, quantity: 1 }],
      })
      .expect(201);
    expect(combo.body.comboItems.map((c: { name: string }) => c.name)).toEqual(['Hamburguesa', 'Papas', 'Gaseosa']);
    await admin.post('/catalog/products', { name: 'Súper combo', price: 1, isCombo: true, comboItems: [{ productId: combo.body.id, quantity: 1 }] }).expect(400);
    await prisma.product.update({ where: { id: papas }, data: { isActive: false } });
    expect((await admin.delete(`/catalog/products/${papas}`).expect(400)).body.message).toContain('Combo Clásico');
    await prisma.product.update({ where: { id: papas }, data: { isActive: true } });

    const menu = await admin.get('/pos/menu').expect(200);
    expect(menu.body.products.find((p: { id: string }) => p.id === combo.body.id).comboItems).toHaveLength(3);

    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    const sale = await admin.post('/sales', { items: [{ productId: combo.body.id, quantity: 2 }], payments: [{ method: 'CASH', amount: 44000 }] }).expect(201);
    expect(await stock(pan)).toBe(-2);
    expect(await stock(carne)).toBe(-200);
    expect(await stock(papa)).toBe(-400);
    expect(await stock(gaseosaItem)).toBe(-2);
    const ticket = await prisma.kitchenTicket.findFirst({ where: { saleId: sale.body.id } });
    expect((ticket!.items as { components: string[] }[])[0].components).toEqual(['1× Hamburguesa', '1× Papas', '1× Gaseosa']);

    // Anular el combo devuelve todo.
    await admin.post(`/sales/${sale.body.id}/void`, { reason: 'prueba' }).expect(201);
    expect(await stock(papa)).toBe(0);
    expect(await stock(gaseosaItem)).toBe(0);
  });

  it('toppings repetibles: suman precio e inventario por cada unidad', async () => {
    const queso = (await prisma.inventoryItem.create({ data: { tenantId, name: 'Queso', unit: 'und' } })).id;
    const helado = await admin
      .post('/catalog/products', {
        name: 'Helado', price: 8000,
        modifierGroups: [
          { name: 'Toppings', minSelect: 0, maxSelect: 4, allowRepeat: true, options: [{ name: 'Queso', priceDelta: 2000, recipe: [{ inventoryItemId: queso, quantity: 1 }] }, { name: 'Arequipe', priceDelta: 1500 }] },
          { name: 'Vaso', minSelect: 0, maxSelect: 1, options: [{ name: 'Grande', priceDelta: 1000 }] },
        ],
      })
      .expect(201);
    const [toppings, vaso] = helado.body.modifierGroups;
    expect(toppings.allowRepeat).toBe(true);
    const q = toppings.options[0].id;
    const a = toppings.options[1].id;
    const g = vaso.options[0].id;

    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    const sale = await admin.post('/sales', { items: [{ productId: helado.body.id, quantity: 1, optionIds: [q, q, a] }], payments: [{ method: 'CASH', amount: 13500 }] }).expect(201);
    expect(sale.body.items[0].unitPrice).toBe(13500);
    expect(await stock(queso)).toBe(-2);
    // Excede el máximo o repite en un grupo que no lo permite.
    await admin.post('/sales', { items: [{ productId: helado.body.id, quantity: 1, optionIds: [q, q, q, a, a] }], payments: [{ method: 'CASH', amount: 1 }] }).expect(400);
    await admin.post('/sales', { items: [{ productId: helado.body.id, quantity: 1, optionIds: [g, g] }], payments: [{ method: 'CASH', amount: 10000 }] }).expect(400);

    // En cuentas abiertas también descuenta por unidad al cobrar.
    const table = await admin.post(`/admin/branches/${branchId}/tables`, { name: 'Mesa T' }).expect(201);
    const order = await admin.post('/orders', { tableId: table.body.id, items: [{ productId: helado.body.id, quantity: 2, optionIds: [q, q] }] }).expect(201);
    await admin.post(`/orders/${order.body.id}/pay`, { payments: [{ method: 'CASH', amount: 24000 }] }).expect(201);
    expect(await stock(queso)).toBe(-6);
  });

  it('el menú ordena categorías y productos por la prioridad de la categoría', async () => {
    const granizados = (await admin.post('/catalog/categories', { name: 'Granizados', sortOrder: 5 }).expect(201)).body.id;
    await admin.post('/catalog/products', { name: 'Agua', price: 3000 }).expect(201); // sin categoría: al final
    await admin.post('/catalog/products', { name: 'Granizado de mango', price: 9000, categoryId: granizados }).expect(201);
    let menu = (await admin.get('/pos/menu').expect(200)).body;
    expect(menu.products.map((p: { name: string }) => p.name)).toEqual(['Hamburguesa', 'Granizado de mango', 'Agua']);

    await admin.put(`/catalog/categories/${granizados}`, { name: 'Granizados', sortOrder: 0 }).expect(200);
    const hamburguesas = menu.categories.find((c: { name: string }) => c.name === 'Hamburguesas').id;
    await admin.put(`/catalog/categories/${hamburguesas}`, { name: 'Hamburguesas', sortOrder: 1 }).expect(200);
    menu = (await admin.get('/pos/menu').expect(200)).body;
    expect(menu.categories.map((c: { name: string }) => c.name)).toEqual(['Granizados', 'Hamburguesas']);
    expect(menu.products.map((p: { name: string }) => p.name)).toEqual(['Granizado de mango', 'Hamburguesa', 'Agua']);
  });

  it('el administrador elimina productos inactivos y el historial de ventas se conserva', async () => {
    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    const sale = await sell({ tipAmount: 0, tipMethod: undefined, payments: [{ method: 'CASH', amount: 36000 }] }).expect(201);

    expect((await admin.delete(`/catalog/products/${burger.id}`).expect(400)).body.message).toContain('desactiva');
    await prisma.product.update({ where: { id: burger.id }, data: { isActive: false } });

    const roles = (await admin.get('/admin/roles').expect(200)).body.roles as { id: string; name: string; permissions: string[] }[];
    const sede = roles.find((r) => r.name === 'Administrador de sede')!;
    expect(sede.permissions).not.toContain('catalog.delete');
    await admin.post('/admin/users', { fullName: 'Sede', username: 'sede@cat.com', password: 'Secreta123!', roleId: sede.id, branchIds: [branchId] }).expect(201);
    await client(app, await loginAs(app, 'sede@cat.com'), branchId).delete(`/catalog/products/${burger.id}`).expect(403);

    await admin.delete(`/catalog/products/${burger.id}`).expect(204);
    expect(await prisma.product.count({ where: { id: burger.id } })).toBe(0);
    const items = await prisma.saleItem.findMany({ where: { saleId: sale.body.id } });
    expect(items[0].productName).toBe('Hamburguesa');
    expect(await prisma.auditLog.count({ where: { action: 'catalog.product_deleted' } })).toBe(1);
  });

  it('descuento en dinero: reduce lo cobrado, cuadra la caja y requiere permiso', async () => {
    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    // 2 hamburguesas grandes = 36.000; descuento de 1.000 → se cobran 35.000.
    const cashOnly = { tipAmount: 0, tipMethod: undefined };
    await sell({ ...cashOnly, discount: 1000, payments: [{ method: 'CASH', amount: 36000 }] }).expect(400);
    await sell({ ...cashOnly, discount: 36000, payments: [{ method: 'CASH', amount: 1 }] }).expect(400);
    const sale = await sell({ ...cashOnly, discount: 1000, discountNote: 'Cliente frecuente', payments: [{ method: 'CASH', amount: 35000 }] }).expect(201);
    expect(sale.body).toMatchObject({ subtotal: 35000, discount: 1000, discountNote: 'Cliente frecuente' });
    expect(sale.body.items.reduce((s: number, i: { lineTotal: number }) => s + i.lineTotal, 0)).toBe(36000);

    // Cuenta abierta con descuento al cobrar.
    const order = await admin.post('/orders', { customerName: 'Ana', items: [{ productId: burger.id, quantity: 1, optionIds: [option('Normal')] }] }).expect(201);
    await admin.post(`/orders/${order.body.id}/pay`, { discount: 500, payments: [{ method: 'TRANSFER', amount: 14500 }] }).expect(201);

    const summary = (await admin.get('/cash/current').expect(200)).body.summary;
    expect(summary).toMatchObject({ salesTotal: 49500, discountsTotal: 1500 });
    expect(summary.expected).toEqual({ CASH: 35000, TRANSFER: 14500, QR_BOLD: 0 });
    expect(await prisma.auditLog.count({ where: { action: 'sale.discount' } })).toBe(2);

    // Sin el permiso (rol Mesero con pos.sell agregado) no puede dar descuentos.
    const roles = (await admin.get('/admin/roles').expect(200)).body.roles as { id: string; name: string; permissions: string[] }[];
    const role = await admin.post('/admin/roles', { name: 'Vendedor', permissions: ['catalog.view', 'pos.sell'] }).expect(201);
    expect(roles.find((r) => r.name === 'Cajero')!.permissions).toContain('pos.discount');
    await admin.post('/admin/users', { fullName: 'Vendedor', username: 'vende@negocio.com', password: 'Secreta123!', roleId: role.body.id, branchIds: [branchId] }).expect(201);
    const vendedor = client(app, await loginAs(app, 'vende@negocio.com'), branchId);
    await vendedor.post('/sales', { items: [{ productId: burger.id, quantity: 1, optionIds: [option('Normal')] }], discount: 100, payments: [{ method: 'CASH', amount: 14900 }] }).expect(403);
    await vendedor.post('/sales', { items: [{ productId: burger.id, quantity: 1, optionIds: [option('Normal')] }], payments: [{ method: 'CASH', amount: 15000 }] }).expect(201);
  });

  it('cocina: cerrar una comanda directamente y cerrar las de días anteriores o todas', async () => {
    await admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    const order = () => sell({ tipAmount: 0, tipMethod: undefined, payments: [{ method: 'CASH', amount: 36000 }] }).expect(201);
    await order(); await order(); await order();
    let tickets = (await admin.get('/kitchen/tickets').expect(200)).body as { id: string; status: string }[];
    expect(tickets).toHaveLength(3);

    // Una pendiente se puede cerrar sin pasar por preparación.
    await admin.patch(`/kitchen/tickets/${tickets[0].id}`, { status: 'DELIVERED' }).expect(200);
    // Simula una comanda olvidada de hace dos días.
    await prisma.kitchenTicket.update({ where: { id: tickets[1].id }, data: { createdAt: new Date(Date.now() - 2 * 86400_000) } });

    await admin.post('/kitchen/tickets/close', { scope: 'otra' }).expect(400);
    expect((await admin.post('/kitchen/tickets/close', { scope: 'previous' }).expect(200)).body).toEqual({ closed: 1 });
    tickets = (await admin.get('/kitchen/tickets').expect(200)).body;
    expect(tickets.filter((t) => t.status === 'PENDING').map((t) => t.id)).toEqual([tickets[2].id]);
    expect((await admin.post('/kitchen/tickets/close', { scope: 'all' }).expect(200)).body).toEqual({ closed: 1 });
    expect(await prisma.kitchenTicket.count({ where: { status: { in: ['PENDING', 'PREPARING', 'READY'] } } })).toBe(0);
  });
});
