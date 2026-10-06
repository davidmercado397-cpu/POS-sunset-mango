import { Badge } from '../ui';
import { formatCOP, formatDateTime, PAYMENT_LABELS } from '../../lib/format';
import type { SaleDetail } from './types';

/** Detalle de una venta: ítems, pagos, propina y estado. */
export function SaleDetailView({ sale }: { sale: SaleDetail }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-bold">Venta #{sale.number}</p>
          <p className="text-slate-500">
            {formatDateTime(sale.completedAt ?? sale.createdAt)} · {sale.createdBy.fullName}
            {sale.table && ` · ${sale.table.name}`}
            {sale.customerName && ` · ${sale.customerName}`}
          </p>
        </div>
        {sale.status === 'COMPLETED' && <Badge tone="green">Pagada</Badge>}
        {sale.status === 'OPEN' && <Badge tone="amber">Abierta</Badge>}
        {sale.status === 'VOIDED' && <Badge tone="red">Anulada</Badge>}
      </div>
      {sale.status === 'VOIDED' && (
        <div className="rounded-xl bg-red-50 p-3 text-red-800">
          Anulada por {sale.voidedBy?.fullName} el {sale.voidedAt && formatDateTime(sale.voidedAt)}. Motivo: {sale.voidReason}
        </div>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {sale.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{i.quantity} × {i.productName}</p>
              {i.modifiers.length > 0 && <p className="text-xs text-slate-500">{i.modifiers.map((m) => m.optionName).join(', ')}</p>}
              {i.notes && <p className="text-xs text-amber-700">“{i.notes}”</p>}
            </div>
            <span className="font-semibold tabular-nums">{formatCOP(i.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCOP(sale.subtotal)}</span></div>
        {sale.tipAmount > 0 && (
          <div className="flex justify-between"><span>Propina ({sale.tipMethod && PAYMENT_LABELS[sale.tipMethod]})</span><span className="tabular-nums">{formatCOP(sale.tipAmount)}</span></div>
        )}
        <div className="flex justify-between text-base font-bold"><span>Total</span><span className="tabular-nums">{formatCOP(sale.subtotal + sale.tipAmount)}</span></div>
      </div>
      {sale.payments.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">Pagos</p>
          {sale.payments.map((p) => (
            <div key={p.id} className="flex justify-between text-slate-600">
              <span>
                {PAYMENT_LABELS[p.method]}
                {p.reference && ` · Ref. ${p.reference}`}
                {p.method === 'CASH' && p.received != null && p.received > p.amount && ` · Recibido ${formatCOP(p.received)}, cambio ${formatCOP(p.change ?? 0)}`}
              </span>
              <span className="tabular-nums">{formatCOP(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
