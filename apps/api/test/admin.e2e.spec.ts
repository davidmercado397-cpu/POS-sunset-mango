import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, createApp, createSuperAdmin, loginAs, PASSWORD, resetDb, setupTenant } from './helpers';

describe('Super Admin y administración del negocio', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await createSuperAdmin(prisma); });

  it('crea un negocio con roles base, sede, admin y categorías de gastos', async () => {
    const { admin } = await setupTenant(app, ['inventory', 'purchases']);
    const me = await admin.get('/auth/me').expect(200);
    expect(me.body.tenant.enabledModules).toEqual(['pos', 'cash', 'inventory', 'purchases']);
    expect(me.body.branches[0].modules).toEqual(['pos', 'cash', 'inventory', 'purchases']);
    const roles = await admin.get('/admin/roles').expect(200);
    expect(roles.body.roles.map((r: { name: string }) => r.name)).toContain('Cajero');
    const cats = await admin.get('/admin/expense-categories').expect(200);
    expect(cats.body.length).toBeGreaterThan(3);
  });

  it('rechaza módulos con dependencias faltantes', async () => {
    const master = client(app, await loginAs(app, 'master'));
    await master
      .post('/platform/tenants', { name: 'X', enabledModules: ['purchases'], admin: { fullName: 'A', username: 'ax', password: PASSWORD } })
      .expect(400);
  });

  it('el admin del negocio no puede activar en la sede módulos no habilitados por el Super Admin', async () => {
    const { admin, branchId } = await setupTenant(app, ['tips']);
    await admin.put(`/admin/branches/${branchId}`, { name: 'Sede', activeModules: ['kitchen'] }).expect(400);
    await admin.put(`/admin/branches/${branchId}`, { name: 'Sede', activeModules: [] }).expect(200);
    const me = await admin.get('/auth/me').expect(200);
    expect(me.body.branches[0].modules).toEqual(['pos', 'cash']);
  });

  it('retirar un módulo del negocio lo apaga en sus sedes', async () => {
    const { admin, master, tenantId } = await setupTenant(app, ['tips', 'kitchen']);
    await master.patch(`/platform/tenants/${tenantId}`, { enabledModules: ['tips'] }).expect(200);
    const me = await admin.get('/auth/me').expect(200);
    expect(me.body.branches[0].modules).toEqual(['pos', 'cash', 'tips']);
  });

  it('aplica permisos y aislamiento entre negocios', async () => {
    const a = await setupTenant(app, [], 'neg-a');
    const b = await setupTenant(app, [], 'neg-b');
    const roles = await a.admin.get('/admin/roles').expect(200);
    const cajero = roles.body.roles.find((r: { name: string }) => r.name === 'Cajero');
    await a.admin.post('/admin/users', { fullName: 'Caja', username: 'caja1', password: PASSWORD, roleId: cajero.id, branchIds: [a.branchId] }).expect(201);

    const caja = client(app, await loginAs(app, 'caja1'), a.branchId);
    await caja.get('/admin/users').expect(403);
    await a.admin.get('/platform/tenants').expect(403);
    // Un admin no puede operar sobre la sede de otro negocio.
    await client(app, b.token, a.branchId).put(`/admin/branches/${a.branchId}`, { name: 'Hack' }).expect(404);
    // Ni asignar a sus usuarios un rol de otro negocio.
    await b.admin.post('/admin/users', { fullName: 'X', username: 'x1', password: PASSWORD, roleId: cajero.id, branchIds: [b.branchId] }).expect(400);
  });

  it('suspender un negocio corta el acceso', async () => {
    const { admin, master, tenantId } = await setupTenant(app, []);
    await master.patch(`/platform/tenants/${tenantId}`, { isActive: false }).expect(200);
    await admin.get('/auth/me').expect(401);
  });
});
