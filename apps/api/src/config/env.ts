/** Lee y valida las variables de entorno una sola vez al iniciar. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes'].includes(v.toLowerCase());
}

export function loadEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const accessSecret = required('JWT_ACCESS_SECRET');
  if (isProd && accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET debe tener al menos 32 caracteres en producción');
  }
  return {
    isProd,
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required('DATABASE_URL'),
    jwtAccessSecret: accessSecret,
    jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS ?? 7),
    cookieSecure: bool('COOKIE_SECURE', isProd),
    /** Número de proxies delante de la app (servidor web del VPS) para leer la IP real */
    trustProxy: Number(process.env.TRUST_PROXY ?? 1),
    corsOrigin: process.env.CORS_ORIGIN || undefined,
    webDist: process.env.WEB_DIST || undefined,
    uploadsDir: process.env.UPLOADS_DIR ?? './uploads',
    /** Dominio base de las tiendas en línea: cada negocio queda en <subdominio>.<este dominio> */
    publicStoreDomain: (process.env.PUBLIC_STORE_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '') || undefined,
    /** URL pública de la aplicación (para armar enlaces /pedir/<negocio> cuando no hay dominio de tiendas) */
    publicAppUrl: (process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '') || undefined,
    maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5),
    lockMinutes: Number(process.env.LOCK_MINUTES ?? 15),
  };
}

export type Env = ReturnType<typeof loadEnv>;
export const ENV = Symbol('ENV');
