import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, createSuperAdmin, resetDb, setupTenant } from './helpers';

describe('Pedidos en línea', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let ctx: Awaited<ReturnType<typeof setupTenant>>;
  let productId: string;
  let carne: string;
  const pub = () => request(app.getHttpServer());

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await createSuperAdmin(prisma);
    ctx = await setupTenant(app, ['online', 'kitchen', 'inventory'], 'tienda');
    carne = (await prisma.inventoryItem.create({ data: { tenantId: ctx.tenantId, name: 'Carne', unit: 'g' } })).id;
    productId = (await ctx.admin.post('/catalog/products', { name: 'Hamburguesa', price: 20000, recipe: [{ inventoryItemId: carne, quantity: 150 }] }).expect(201)).body.id;
    await ctx.admin.put('/online/settings', { onlineAccepting: true, allowDelivery: true, allowPickup: true, deliveryFee: 5000, minOrder: 15000, whatsapp: '300 123 4567', transferInfo: 'Nequi 3001234567' }).expect(200);
  });

  const order = (overrides: object = {}) =>
    pub().post('/api/public/store/tienda/orders').send({
      branchId: ctx.branchId, type: 'DELIVERY', customerName: 'Laura Gómez', phone: '300 555 1234',
      address: 'Calle 45 # 12-30 apto 501', paymentMethod: 'TRANSFER',
      items: [{ productId, quantity: 2, notes: 'sin cebolla' }],
      ...overrides,
    });

  it('flujo completo: tienda pública, pedido sin usuario, cocina, seguimiento y cobro en caja', async () => {
    let store = await pub().get('/api/public/store/tienda').expect(200);
    expect(store.body.branches[0]).toMatchObject({ open: false, deliveryFee: 5000, transferInfo: 'Nequi 3001234567' }); // caja cerrada = tienda cerrada
    expect(store.body.paymentMethods).toEqual(['TRANSFER']); // Bold queda pendiente de integrar
    await order().expect(400);

    await ctx.admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    store = await pub().get('/api/public/store/tienda').expect(200);
    expect(store.body.branches[0].open).toBe(true);
    const menu = await pub().get(`/api/public/store/tienda/menu?branchId=${ctx.branchId}`).expect(200);
    expect(menu.body.products[0]).toMatchObject({ name: 'Hamburguesa', price: 20000 });
    expect(menu.body).not.toHaveProperty('cashSession');

    const placed = await order().expect(201);
    expect(placed.body).toMatchObject({ total: 45000 });
    const code = placed.body.code;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    // Llega al panel, pero no a cocina hasta que alguien lo acepte.
    expect((await ctx.admin.get('/kitchen/tickets').expect(200)).body).toHaveLength(0);

    const track = await pub().get(`/api/public/orders/${code.toLowerCase()}`).expect(200);
    expect(track.body).toMatchObject({ status: 'NEW', total: 45000, customerName: 'Laura' });
    expect(track.body).not.toHaveProperty('phone');
    expect(track.body).not.toHaveProperty('address');

    const list = await ctx.admin.get('/online/orders').expect(200);
    const id = list.body[0].id;
    await ctx.admin.patch(`/online/orders/${id}/status`, { status: 'READY' }).expect(400); // primero se acepta
    await ctx.admin.patch(`/online/orders/${id}/status`, { status: 'ACCEPTED' }).expect(200);
    await ctx.admin.patch(`/online/orders/${id}/status`, { status: 'ACCEPTED' }).expect(400);
    const tickets = await ctx.admin.get('/kitchen/tickets').expect(200);
    expect(tickets.body).toHaveLength(1);
    expect(tickets.body[0].label).toContain(code);
    expect(tickets.body[0].items[0]).toMatchObject({ name: 'Hamburguesa', quantity: 2, notes: 'sin cebolla' });

    await ctx.admin.post(`/online/orders/${id}/payment`, { reference: 'TRF-998' }).expect(201);
    expect((await pub().get(`/api/public/orders/${code}`)).body.paymentStatus).toBe('PAID');
    await ctx.admin.patch(`/online/orders/${id}/status`, { status: 'DISPATCHED' }).expect(200);

    await ctx.admin.post(`/online/orders/${id}/pay`, { payments: [{ method: 'TRANSFER', amount: 40000 }] }).expect(400);
    const sale = await ctx.admin.post(`/online/orders/${id}/pay`, { payments: [{ method: 'TRANSFER', amount: 45000, reference: 'TRF-998' }] }).expect(201);
    expect(sale.body.items.map((i: { productName: string; lineTotal: number }) => [i.productName, i.lineTotal])).toEqual([['Hamburguesa', 40000], ['Domicilio', 5000]]);
    expect(Number((await prisma.stock.findFirst({ where: { itemId: carne } }))!.quantity)).toBe(-300);
    expect((await pub().get(`/api/public/orders/${code}`)).body.status).toBe('COMPLETED');
    await ctx.admin.post(`/online/orders/${id}/pay`, { payments: [{ method: 'TRANSFER', amount: 45000 }] }).expect(400);

    const current = await ctx.admin.get('/cash/current').expect(200);
    expect(current.body.summary.expected.TRANSFER).toBe(45000);
  });

  it('valida reglas de la tienda y protege contra abusos', async () => {
    await ctx.admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    await order({ items: [{ productId, quantity: 1 }] }).expect(201); // 20.000 ≥ mínimo
    await order({ address: '' }).expect(400);
    await order({ website: 'http://spam' }).expect(400); // trampa para bots
    await order({ paymentMethod: 'CASH' }).expect(400); // en línea solo transferencia (o Bold cuando se active)
    await order({ paymentMethod: 'QR_BOLD' }).expect(400);
    await order({ phone: 'abc' }).expect(400);
    await order().expect(201);
    await order().expect(201);
    await order().expect(400); // máximo 3 pedidos activos por teléfono

    await ctx.admin.put('/online/settings', { onlineAccepting: false, allowDelivery: true, allowPickup: true, deliveryFee: 5000, minOrder: 30000 }).expect(200);
    await order({ phone: '311 000 0000' }).expect(400); // tienda pausada
  });

  it('rechazar cancela la comanda y la tienda no existe si el módulo no está habilitado', async () => {
    await ctx.admin.post('/cash/open', { openingAmount: 0 }).expect(201);
    const { code } = (await order({ type: 'PICKUP', address: undefined })).body;
    const id = (await ctx.admin.get('/online/orders').expect(200)).body[0].id;
    await ctx.admin.post(`/online/orders/${id}/reject`, { reason: 'Sin existencias' }).expect(201);
    const track = await pub().get(`/api/public/orders/${code}`).expect(200);
    expect(track.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Sin existencias' });
    expect(await prisma.kitchenTicket.count()).toBe(0); // nunca llegó a cocina

    // Un pedido aceptado y luego cancelado cancela su comanda.
    await order({ phone: '310 000 1111' }).expect(201);
    const second = (await ctx.admin.get('/online/orders').expect(200)).body[0].id;
    await ctx.admin.patch(`/online/orders/${second}/status`, { status: 'ACCEPTED' }).expect(200);
    await ctx.admin.post(`/online/orders/${second}/reject`, { reason: 'tarde' }).expect(400); // ya aceptado: se cancela
    await ctx.admin.post(`/online/orders/${second}/cancel`, { reason: 'Cliente canceló' }).expect(201);
    expect((await prisma.kitchenTicket.findFirst())!.status).toBe('CANCELLED');

    await setupTenant(app, ['kitchen'], 'sin-online');
    await pub().get('/api/public/store/sin-online').expect(404);
  });

  it('tienda por subdominio dinámico o dominio propio', async () => {
    // Subdominio inicial = identificador del negocio ("tienda" está reservado, así que queda "tienda-1").
    let settings = await ctx.admin.get('/online/settings').expect(200);
    expect(settings.body).toMatchObject({ storeSubdomain: 'tienda-1', storeUrl: 'https://tienda-1.pedidos.test.co' });

    const host = (h: string) => pub().get('/api/public/host').set('Host', h);
    expect((await host('tienda-1.pedidos.test.co')).body).toEqual({ store: 'tienda' });
    expect((await host('otra.pedidos.test.co')).body).toEqual({ store: null });
    expect((await host('pos.midominio.com')).body).toEqual({ store: null });

    // El negocio cambia su subdominio; validaciones y reservados.
    await ctx.admin.put('/online/subdomain', { storeSubdomain: 'Sunset Mango!' }).expect(400);
    await ctx.admin.put('/online/subdomain', { storeSubdomain: 'www' }).expect(400);
    settings = await ctx.admin.put('/online/subdomain', { storeSubdomain: 'sunsetmango' }).expect(200);
    expect(settings.body.storeUrl).toBe('https://sunsetmango.pedidos.test.co');
    expect((await host('sunsetmango.pedidos.test.co')).body).toEqual({ store: 'tienda' });
    expect((await host('tienda-1.pedidos.test.co')).body).toEqual({ store: null });

    // Otro negocio no puede tomar el mismo subdominio.
    const other = await setupTenant(app, ['online'], 'otro-negocio');
    await other.admin.put('/online/subdomain', { storeSubdomain: 'sunsetmango' }).expect(409);

    // El Super Admin asigna un dominio propio.
    await ctx.master.patch(`/platform/tenants/${ctx.tenantId}`, { storeDomain: 'https://Pedidos.SunsetMango.com/' }).expect(200);
    expect((await host('pedidos.sunsetmango.com')).body).toEqual({ store: 'tienda' });
    expect((await ctx.admin.get('/online/settings')).body.storeUrl).toBe('https://pedidos.sunsetmango.com');
    await other.master.patch(`/platform/tenants/${other.tenantId}`, { storeDomain: 'pedidos.sunsetmango.com' }).expect(409);
    await ctx.master.patch(`/platform/tenants/${ctx.tenantId}`, { storeDomain: '' }).expect(200);
    expect((await ctx.admin.get('/online/settings')).body.storeUrl).toBe('https://sunsetmango.pedidos.test.co');

    // Subdominio vacío: la tienda queda en el dominio de tiendas directamente (un solo negocio).
    settings = await ctx.admin.put('/online/subdomain', { storeSubdomain: '' }).expect(200);
    expect(settings.body).toMatchObject({ storeSubdomain: null, storeDomain: 'pedidos.test.co', storeUrl: 'https://pedidos.test.co' });
    expect((await host('pedidos.test.co')).body).toEqual({ store: 'tienda' });
    await other.admin.put('/online/subdomain', { storeSubdomain: '' }).expect(409);
    await other.master.patch(`/platform/tenants/${other.tenantId}`, { storeSubdomain: '', storeDomain: '' }).expect(409);
    // Al volver a un subdominio, libera el dominio para otro negocio.
    await ctx.admin.put('/online/subdomain', { storeSubdomain: 'sunsetmango' }).expect(200);
    expect((await host('pedidos.test.co')).body).toEqual({ store: null });
    await other.master.patch(`/platform/tenants/${other.tenantId}`, { storeSubdomain: '', storeDomain: '' }).expect(200);
    expect((await host('pedidos.test.co')).body).toEqual({ store: 'otro-negocio' });

    // Un negocio suspendido o sin el módulo no responde en su subdominio.
    await ctx.master.patch(`/platform/tenants/${ctx.tenantId}`, { isActive: false }).expect(200);
    expect((await host('sunsetmango.pedidos.test.co')).body).toEqual({ store: null });
  });
});
