import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { SaleDetailView } from '../../components/pos/SaleDetailView';
import type { PaymentMethod, SaleDetail } from '../../components/pos/types';
import { Badge, Button, EmptyState, Field, Input, PageHeader, Select, Table, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP, formatTime, PAYMENT_LABELS, todayISO, formatDate } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';

interface SaleRow {
  id: string;
  number: number;
  status: 'OPEN' | 'COMPLETED' | 'VOIDED';
  subtotal: number;
  tipAmount: number;
  customerName: string | null;
  createdAt: string;
  table: { name: string } | null;
  createdBy: { fullName: string };
  payments: { method: PaymentMethod; amount: number }[];
  _count: { items: number };
}

export function SalesPage() {
  const { branchId, can } = useAuth();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const sales = useApi<SaleRow[]>(['sales', branchId, from, to, status], `/sales?from=${from}&to=${to}&status=${status}`);
  const completed = sales.data?.filter((s) => s.status === 'COMPLETED') ?? [];
  const total = completed.reduce((s, x) => s + x.subtotal, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Ventas" subtitle={sales.data ? `${completed.length} ventas pagadas · ${formatCOP(total)}` : undefined} />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Estado">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="COMPLETED">Pagadas</option>
            <option value="VOIDED">Anuladas</option>
            <option value="OPEN">Abiertas</option>
          </Select>
        </Field>
      </div>
      {sales.data?.length === 0 ? <EmptyState>No hay ventas en este rango.</EmptyState> : (
        <Table>
          <thead><tr><th>#</th><th>Hora</th><th>Cliente / mesa</th><th>Pago</th><th>Vendedor</th><th className="text-right">Total</th><th /></tr></thead>
          <tbody>
            {sales.data?.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(s.id)}>
                <td className="font-semibold">{s.number}</td>
                <td className="whitespace-nowrap">{from !== to && `${formatDate(s.createdAt)} `}{formatTime(s.createdAt)}</td>
                <td>{[s.table?.name, s.customerName].filter(Boolean).join(' · ') || '—'}</td>
                <td>{[...new Set(s.payments.map((p) => PAYMENT_LABELS[p.method]))].join(' + ') || '—'}</td>
                <td>{s.createdBy.fullName}</td>
                <td className="text-right font-semibold tabular-nums">{formatCOP(s.subtotal + s.tipAmount)}</td>
                <td>
                  {s.status === 'VOIDED' && <Badge tone="red">Anulada</Badge>}
                  {s.status === 'OPEN' && <Badge tone="amber">Abierta</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {selected && <SaleModal id={selected} canVoid={can('sales.void')} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SaleModal({ id, canVoid, onClose }: { id: string; canVoid: boolean; onClose: () => void }) {
  const sale = useApi<SaleDetail>(['sales', 'detail', id], `/sales/${id}`);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const voidSale = useApiMutation(() => api(`/sales/${id}/void`, { method: 'POST', json: { reason } }), {
    invalidate: [['sales'], ['cash']],
    success: 'Venta anulada',
  });
  return (
    <Modal open onClose={onClose} title="Detalle de venta" size="md"
      footer={canVoid && sale.data?.status === 'COMPLETED' && !voiding ? <Button variant="danger" onClick={() => setVoiding(true)}>Anular venta</Button> : undefined}>
      {sale.data && <SaleDetailView sale={sale.data} />}
      {voiding && (
        <div className="mt-4 space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">La anulación devuelve el inventario y saca la venta del cuadre de caja. Solo es posible mientras la caja siga abierta.</p>
          <Field label="Motivo"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoiding(false)}>Cancelar</Button>
            <Button variant="danger" loading={voidSale.isPending} disabled={reason.trim().length < 3} onClick={() => voidSale.mutate(undefined, { onSuccess: () => setVoiding(false) })}>Confirmar anulación</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
