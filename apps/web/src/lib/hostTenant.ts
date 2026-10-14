/** Restaurante dueño del subdominio actual (ej. otro.sunsetmango.com.co), si lo hay. */
export interface HostTenant {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

/** En el subdominio de un restaurante la app del personal vive en esta ruta (la tienda queda en la raíz). */
export const STAFF_BASE = '/admin';

let current: HostTenant | null = null;

export function setHostTenant(tenant: HostTenant | null) {
  current = tenant;
}

export function getHostTenant(): HostTenant | null {
  return current;
}
