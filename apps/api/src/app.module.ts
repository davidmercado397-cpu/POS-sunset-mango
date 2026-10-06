import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { resolve } from 'node:path';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AppConfigModule } from './config/config.module';
import { ENV, Env } from './config/env';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

/** En producción la API también sirve el frontend compilado (SPA). */
function staticModules(): DynamicModule[] {
  const webDist = process.env.WEB_DIST;
  if (!webDist) return [];
  return [
    ServeStaticModule.forRoot({
      rootPath: resolve(webDist),
      exclude: ['/api/{*path}', '/uploads/{*path}'],
    }),
  ];
}

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.jwtAccessSecret,
        signOptions: { expiresIn: env.jwtAccessTtl as `${number}m` },
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    ...staticModules(),
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    // Orden: límite de peticiones → autenticación → permisos.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
