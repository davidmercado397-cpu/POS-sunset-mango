import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { ENV, Env } from '../src/config/env';
import { configureApp } from '../src/main';
import { resetDb } from './helpers';

/**
 * Pruebas de integración contra PostgreSQL real.
 * Requiere DATABASE_URL apuntando a una base de datos de pruebas con las migraciones aplicadas.
 */
describe('Autenticación', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  const PASSWORD = 'Secreta123!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, app.get<Env>(ENV));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { username: 'master', fullName: 'Master', isSuperAdmin: true, passwordHash: await hashPassword(PASSWORD) },
    });
  });

  const login = (username = 'master', password = PASSWORD) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ username, password });

  const refreshCookie = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('pos_rt='))!.split(';')[0];

  it('inicia sesión y devuelve token de acceso y cookie httpOnly', async () => {
    const res = await login().expect(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).join(';');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('el usuario no distingue mayúsculas', async () => {
    await login('MASTER').expect(200);
  });

  it('rechaza contraseña incorrecta y bloquea tras 5 intentos', async () => {
    for (let i = 0; i < 5; i++) await login('master', 'mala').expect(401);
    const res = await login().expect(401);
    expect(res.body.message).toMatch(/bloqueado/);
  });

  it('protege las rutas privadas', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    const { body } = await login();
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
    expect(me.body.user.isSuperAdmin).toBe(true);
  });

  it('rota el refresh token y revoca la sesión si se reutiliza uno viejo', async () => {
    const first = refreshCookie(await login());
    const r1 = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(r1);
    expect(second).not.toEqual(first);

    // Reutilizar el token viejo revoca toda la familia, incluido el nuevo.
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', first).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', second).expect(401);
  });

  it('cerrar sesión invalida el refresh token', async () => {
    const cookie = refreshCookie(await login());
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('bloquea el acceso a usuarios de un negocio suspendido', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Demo', slug: 'demo' } });
    await prisma.user.create({
      data: { username: 'cajero', fullName: 'Cajero', tenantId: tenant.id, passwordHash: await hashPassword(PASSWORD) },
    });
    const { body } = await login('cajero').expect(200);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { isActive: false } });
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${body.accessToken}`).expect(401);
    await login('cajero').expect(401);
  });
});
