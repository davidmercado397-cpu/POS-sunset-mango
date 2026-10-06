import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from './auth-user';

/** Devuelve el negocio del usuario o falla si es el Super Admin. */
export function tenantOf(user: AuthUser): string {
  if (!user.tenantId) throw new ForbiddenException('Esta acción pertenece a un negocio');
  return user.tenantId;
}

/** Convierte un Decimal de Prisma (o null) a número. */
export const num = (value: Prisma.Decimal | number | null | undefined): number => (value == null ? 0 : Number(value));

/** Redondea a 3 decimales (cantidades de inventario). */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Inicio y fin de un rango de fechas (YYYY-MM-DD) en hora de Colombia (UTC-5). */
export function dayRange(from?: string, to?: string): { gte: Date; lt: Date } {
  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : start;
  const gte = new Date(`${start}T00:00:00-05:00`);
  const lt = new Date(new Date(`${end}T00:00:00-05:00`).getTime() + 86400_000);
  return { gte, lt };
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
