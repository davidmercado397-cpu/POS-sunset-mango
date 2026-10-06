import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { ENV, Env } from './config/env';

export function configureApp(app: NestExpressApplication, env: Env) {
  // La app corre detrás del servidor web del VPS (proxy inverso con HTTPS).
  app.set('trust proxy', env.trustProxy);
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  if (env.corsOrigin) {
    app.enableCors({ origin: env.corsOrigin.split(','), credentials: true });
  }
  const uploads = resolve(env.uploadsDir);
  mkdirSync(uploads, { recursive: true });
  app.useStaticAssets(uploads, { prefix: '/uploads', maxAge: '7d', index: false });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const env = app.get<Env>(ENV);
  configureApp(app, env);
  app.enableShutdownHooks();
  await app.listen(env.port, '0.0.0.0');
  Logger.log(`API escuchando en el puerto ${env.port}`, 'Bootstrap');
}

if (require.main === module) {
  void bootstrap();
}
