import { createContext, useContext } from 'react';

/**
 * Ruta base de la tienda: '' cuando se abre en su subdominio o dominio propio,
 * o '/pedir/<negocio>' cuando se abre desde el dominio principal.
 */
export const StoreBaseContext = createContext<{ slug: string; base: string } | null>(null);

export function useStoreBase(fallbackSlug: string) {
  return useContext(StoreBaseContext) ?? { slug: fallbackSlug, base: `/pedir/${fallbackSlug}` };
}
