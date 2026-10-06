import { BadRequestException } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { Env } from '../config/env';

/** Subdominios que no se pueden asignar a una tienda. */
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'pos', 'mail', 'smtp', 'ftp', 'static', 'cdn', 'pedidos', 'tienda', 'soporte', 'help', 'status']);

export function normalizeSubdomain(value: string): string {
  const sub = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(sub)) {
    throw new BadRequestException('El subdominio solo admite minúsculas, números y guiones (2 a 40 caracteres, sin guion al inicio o al final)');
  }
  if (RESERVED.has(sub)) throw new BadRequestException(`"${sub}" es un subdominio reservado`);
  return sub;
}

export function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
    throw new BadRequestException('Dominio inválido (ej. pedidos.minegocio.com)');
  }
  return domain;
}

/**
 * Enlace público de la tienda de un negocio, en orden de preferencia:
 * dominio propio → subdominio del dominio de tiendas → <app>/pedir/<negocio>.
 * Devuelve una ruta relativa si no hay ningún dominio configurado (el navegador completa el origen).
 */
export function storeUrl(tenant: Pick<Tenant, 'slug' | 'storeSubdomain' | 'storeDomain'>, env: Pick<Env, 'publicStoreDomain' | 'publicAppUrl'>): string {
  if (tenant.storeDomain) return `https://${tenant.storeDomain}`;
  if (env.publicStoreDomain && tenant.storeSubdomain) return `https://${tenant.storeSubdomain}.${env.publicStoreDomain}`;
  return `${env.publicAppUrl ?? ''}/pedir/${tenant.slug}`;
}

/** Identifica el negocio a partir del host de la petición (subdominio o dominio propio). */
export function subdomainFromHost(host: string, publicStoreDomain?: string): string | null {
  if (!publicStoreDomain) return null;
  const suffix = `.${publicStoreDomain}`;
  if (!host.endsWith(suffix)) return null;
  const sub = host.slice(0, -suffix.length);
  return sub && !sub.includes('.') ? sub : null;
}
