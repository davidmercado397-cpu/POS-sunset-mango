import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { ENV, Env } from '../src/config/env';
import { configureApp } from '../src/main';

export const PASSWORD = 'Secreta123!';

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, app.get<Env>(ENV));
  await app.init();
  return app;
}

/** Vacía todas las tablas de la base de datos de pruebas. */
export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

export async function createSuperAdmin(prisma: PrismaClient) {
  await prisma.user.create({
    data: { username: 'master', fullName: 'Master', isSuperAdmin: true, passwordHash: await hashPassword(PASSWORD) },
  });
}

export async function loginAs(app: NestExpressApplication, username: string, password = PASSWORD): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password }).expect(200);
  return res.body.accessToken;
}

/** Cliente con token y sede opcional. */
export function client(app: NestExpressApplication, token: string, branchId?: string) {
  const server = app.getHttpServer();
  const wrap = (req: request.Test) => {
    req.set('Authorization', `Bearer ${token}`);
    if (branchId) req.set('X-Branch-Id', branchId);
    return req;
  };
  return {
    get: (url: string) => wrap(request(server).get(`/api${url}`)),
    post: (url: string, body?: object) => wrap(request(server).post(`/api${url}`)).send(body),
    put: (url: string, body?: object) => wrap(request(server).put(`/api${url}`)).send(body),
    patch: (url: string, body?: object) => wrap(request(server).patch(`/api${url}`)).send(body),
    delete: (url: string) => wrap(request(server).delete(`/api${url}`)),
  };
}

/** Crea un negocio completo vía API y devuelve el cliente de su administrador. */
export async function setupTenant(app: NestExpressApplication, modules: string[], slug = 'demo') {
  const master = client(app, await loginAs(app, 'master'));
  const res = await master
    .post('/platform/tenants', {
      name: `Negocio ${slug}`,
      slug,
      enabledModules: modules,
      admin: { fullName: 'Admin', username: `admin-${slug}`, password: PASSWORD },
    })
    .expect(201);
  const branchId: string = res.body.branches[0].id;
  const token = await loginAs(app, `admin-${slug}`);
  return { tenantId: res.body.id as string, branchId, token, admin: client(app, token, branchId), master };
}
