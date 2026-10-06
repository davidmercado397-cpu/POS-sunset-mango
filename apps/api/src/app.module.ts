import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { resolve } from 'node:path';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CashModule } from './cash/cash.module';
import { CatalogModule } from './catalog/catalog.module';
import { BranchGuard } from './common/guards/branch.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AppConfigModule } from './config/config.module';
import { ENV, Env } from './config/env';
import { HealthController } from './health/health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { StockModule } from './inventory/stock.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { SalesModule } from './sales/sales.module';
import { UploadsModule } from './uploads/uploads.module';

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
    UploadsModule,
    AuthModule,
    PlatformModule,
    AdminModule,
    CatalogModule,
    StockModule,
    KitchenModule,
    CashModule,
    SalesModule,
    InventoryModule,
  ],
  controllers: [HealthController],
  providers: [
    // Orden: límite de peticiones → autenticación → permisos → sede y módulos.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BranchGuard },
  ],
})
export class AppModule {}
