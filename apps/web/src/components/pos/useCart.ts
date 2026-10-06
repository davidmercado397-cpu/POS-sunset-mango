import { useCallback, useMemo, useState } from 'react';
import type { CartLine, MenuOption, MenuProduct } from './types';

/** Carrito en memoria. Las líneas iguales (producto + opciones + nota) se agrupan. */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback((product: MenuProduct, options: MenuOption[], quantity = 1, notes = '') => {
    const key = `${product.id}|${options.map((o) => o.id).sort().join(',')}|${notes.trim()}`;
    const unitPrice = product.price + options.reduce((s, o) => s + o.priceDelta, 0);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      return [...prev, { key, productId: product.id, name: product.name, imageUrl: product.imageUrl, unitPrice, quantity, options, notes: notes.trim() }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((prev) => (quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const total = useMemo(() => lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  return { lines, add, setQuantity, clear, total, count };
}

export type Cart = ReturnType<typeof useCart>;
