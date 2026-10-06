import { Minus, Plus, ShoppingCart } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProductImage } from '../ProductImage';
import { formatCOP } from '../../lib/format';
import type { Cart } from './useCart';

/** Lista del pedido con cantidades editables. */
export function CartView({ cart, header, footer }: { cart: Cart; header?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-400">
            <ShoppingCart className="size-10" />
            Toca un producto para agregarlo
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cart.lines.map((l) => (
              <li key={l.key} className="flex gap-3 py-3">
                <ProductImage src={l.imageUrl} alt="" className="size-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  {l.options.length > 0 && <p className="truncate text-xs text-slate-500">{l.options.map((o) => o.name).join(', ')}</p>}
                  {l.notes && <p className="truncate text-xs text-amber-700">“{l.notes}”</p>}
                  <p className="text-sm font-bold">{formatCOP(l.unitPrice * l.quantity)}</p>
                </div>
                <div className="flex items-center gap-1 self-center">
                  <button className="rounded-lg border border-slate-200 p-2" onClick={() => cart.setQuantity(l.key, l.quantity - 1)} aria-label="Menos"><Minus className="size-4" /></button>
                  <span className="w-7 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
                  <button className="rounded-lg border border-slate-200 p-2" onClick={() => cart.setQuantity(l.key, l.quantity + 1)} aria-label="Más"><Plus className="size-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {footer}
    </div>
  );
}
