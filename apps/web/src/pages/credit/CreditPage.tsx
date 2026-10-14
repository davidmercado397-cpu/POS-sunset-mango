import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { MoneyInput } from '../../components/MoneyInput';
import { Alert, Badge, Button, EmptyState, Field, Input, PageHeader, Select, Table, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP, formatDate, formatDateTime, PAYMENT_LABELS, todayISO } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';

type Status = 'PENDING' | 'PAID' | 'ALL';
type Method = 'CASH' | 'TRANSFER' | 'QR_BOLD';

interface ReceivableRow {
  id: string;
  debtorName: string;
  notes: string | null;
  amount: number;
  paidAmount: number;
  balance: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  createdAt: string;
  paidAt: string | null;
  sale: { number: number };
  createdBy: { fullName: string };
}

interface ReceivableDetail extends Omit<ReceivableRow, 'sale'> {
  sale: { id: string; number: number; subtotal: number; createdAt: string; items: { id: string; productName: string; quantity: number; lineTotal: number }[]; payments: { method: Method; amount: number }[] };
  payments: { id: string; method: Method; amount: number; reference: string | null; notes: string | null; paidAt: string; createdAt: string; createdBy: { fullName: string } }[];
}

/** Ventas a crédito (fiado): lo que deben los clientes y el registro de sus pagos. */
export function CreditPage() {
  const { branchId } = useAuth();
  const [status, setStatus] = useState<Status>('PENDING');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const list = useApi<{ receivables: ReceivableRow[]; pending: { count: number; balance: number } }>(
    ['credit', branchId, status, q],
    `/credit/receivables?status=${status}&q=${encodeURIComponent(q.trim())}`,
  );
  const pending = list.data?.pending;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Créditos"
        subtitle={pending ? `${pending.count} cuenta${pending.count === 1 ? '' : 's'} por cobrar · ${formatCOP(pending.balance)} pendientes` : 'Ventas a crédito (fiado) de la sede'}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Tabs value={status} onChange={setStatus} tabs={[{ value: 'PENDING', label: 'Por cobrar' }, { value: 'PAID', label: 'Pagadas' }, { value: 'ALL', label: 'Todas' }]} />
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar por nombre de quien debe" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {list.data && list.data.receivables.length === 0 ? (
        <EmptyState>{status === 'PENDING' ? 'No hay cuentas por cobrar.' : 'No hay cuentas en esta vista.'}</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr><th>Fecha</th><th>Quien debe</th><th>Venta</th><th className="text-right">Valor</th><th className="text-right">Abonado</th><th className="text-right">Saldo</th><th /></tr>
          </thead>
          <tbody>
            {list.data?.receivables.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(r.id)}>
                <td className="whitespace-nowrap">{formatDate(r.createdAt)}</td>
                <td>
                  <p className="font-medium">{r.debtorName}</p>
                  {r.notes && <p className="max-w-64 truncate text-xs text-slate-500">{r.notes}</p>}
                </td>
                <td>#{r.sale.number}</td>
                <td className="text-right tabular-nums">{formatCOP(r.amount)}</td>
                <td className="text-right tabular-nums">{formatCOP(r.paidAmount)}</td>
                <td className={clsx('text-right font-semibold tabular-nums', r.balance > 0 && 'text-amber-700')}>{formatCOP(r.balance)}</td>
                <td>{r.status === 'PAID' ? <Badge tone="green">Pagada</Badge> : <Badge tone="amber">Pendiente</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {selected && <ReceivableModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ReceivableModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { branchId } = useAuth();
  const detail = useApi<ReceivableDetail>(['credit', branchId, 'detail', id], `/credit/receivables/${id}`);
  const r = detail.data;
  return (
    <Modal open onClose={onClose} size="md" title={r ? `Crédito de ${r.debtorName}` : 'Crédito'}>
      {r && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Valor</p><p className="font-bold tabular-nums">{formatCOP(r.amount)}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Abonado</p><p className="font-bold tabular-nums">{formatCOP(r.paidAmount)}</p></div>
            <div className={clsx('rounded-xl p-3', r.balance > 0 ? 'bg-amber-50' : 'bg-emerald-50')}>
              <p className="text-xs text-slate-500">Saldo</p><p className="font-bold tabular-nums">{formatCOP(r.balance)}</p>
            </div>
          </div>
          <div className="space-y-1">
            <p><span className="text-slate-500">Venta:</span> #{r.sale.number} · {formatDateTime(r.sale.createdAt)} · registró {r.createdBy.fullName}</p>
            {r.notes && <p><span className="text-slate-500">Observaciones:</span> {r.notes}</p>}
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {r.sale.items.map((i) => (
              <li key={i.id} className="flex justify-between px-3 py-2"><span>{i.quantity} × {i.productName}</span><span className="tabular-nums">{formatCOP(i.lineTotal)}</span></li>
            ))}
            {r.sale.payments.length > 0 && (
              <li className="flex justify-between px-3 py-2 text-slate-500">
                <span>Pagado al momento de la venta ({r.sale.payments.map((p) => PAYMENT_LABELS[p.method]).join(' + ')})</span>
                <span className="tabular-nums">{formatCOP(r.sale.payments.reduce((s, p) => s + p.amount, 0))}</span>
              </li>
            )}
          </ul>
          {r.payments.length > 0 && (
            <div>
              <p className="mb-1 font-semibold">Pagos registrados</p>
              <ul className="space-y-1">
                {r.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <span>
                      {formatDate(p.paidAt)} · {PAYMENT_LABELS[p.method]}{p.reference && ` · ${p.reference}`}
                      <span className="block text-xs text-slate-500">Registró {p.createdBy.fullName}{p.notes && ` · ${p.notes}`}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatCOP(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.status === 'PENDING' ? <PaymentForm receivable={r} /> : r.status === 'PAID' && <Alert tone="success">Cuenta saldada{r.paidAt && ` el ${formatDate(r.paidAt)}`}.</Alert>}
        </div>
      )}
    </Modal>
  );
}

function PaymentForm({ receivable }: { receivable: ReceivableDetail }) {
  const { branchId } = useAuth();
  const [method, setMethod] = useState<Method>('CASH');
  const [amount, setAmount] = useState(receivable.balance);
  const [paidAt, setPaidAt] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const pay = useApiMutation(
    () => api(`/credit/receivables/${receivable.id}/payments`, {
      method: 'POST',
      json: { method, amount, paidAt, reference: reference.trim() || undefined, notes: notes.trim() || undefined },
    }),
    { invalidate: [['credit', branchId], ['cash'], ['sales']], success: amount === receivable.balance ? 'Cuenta saldada' : 'Abono registrado' },
  );
  const invalid = amount <= 0 || amount > receivable.balance;
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
      <p className="font-semibold">Registrar pago</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Método de pago">
          <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            {(['CASH', 'TRANSFER', 'QR_BOLD'] as Method[]).map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
          </Select>
        </Field>
        <Field label="Fecha del pago"><Input type="date" value={paidAt} max={todayISO()} onChange={(e) => setPaidAt(e.target.value)} /></Field>
        <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} /></Field>
        {method !== 'CASH' && <Field label="Referencia (opcional)"><Input value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} /></Field>}
      </div>
      <Field label="Observación (opcional)"><Input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field>
      {amount > receivable.balance && <Alert>El valor supera el saldo pendiente ({formatCOP(receivable.balance)}).</Alert>}
      <p className="text-xs text-slate-500">El dinero entra a la caja abierta de la sede y aparece en su cuadre como "Pagos de créditos".</p>
      <Button className="w-full" disabled={invalid} loading={pay.isPending} onClick={() => pay.mutate()}>
        {amount === receivable.balance ? `Saldar cuenta (${formatCOP(amount)})` : `Registrar abono de ${formatCOP(Math.max(0, amount))}`}
      </Button>
    </div>
  );
}
