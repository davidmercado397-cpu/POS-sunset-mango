import clsx from 'clsx';
import { CheckCircle2, Lock, Printer } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { BarChart, RankList } from '../../components/charts';
import { Modal } from '../../components/Modal';
import { Alert, Badge, Button, Card, Field, Input, Table, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP, formatDate, formatDateTime, PAYMENT_LABELS } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import { Stat } from './CashSummaryView';
import { METHODS, type ByMethod } from './types';

interface MonthData {
  period: { year: number; month: number; from: string; to: string };
  totals: { salesCount: number; salesTotal: number; tips: number; avgTicket: number; voidedCount: number; voidedTotal: number; purchases: number; expenses: number; expensesTransfer: number; withdrawals: number; cost: number | null; grossProfit: number | null };
  byMethod: { method: string; sales: number; tips: number }[];
  byDay: { day: string; total: number; count: number }[];
  byCategory: { name: string; total: number }[];
  expenses: { type: string; method: string; category: string; total: number }[];
  days: { id: string; status: 'OPEN' | 'CLOSED'; openedAt: string; closedAt: string | null; openedBy: string; closedBy: string | null; salesCount: number; salesTotal: number; tipsTotal: number; expenses: number; expected: ByMethod; counted: ByMethod | null; difference: ByMethod | null }[];
  differences: ByMethod;
  canClose: boolean;
  blockers: string[];
  closed: { at: string; by: string; notes: string | null } | null;
}
interface HistoryRow { id: string; year: number; month: number; closedAt: string; salesTotal: number; salesCount: number; difference: number }

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const shortCOP = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
const diffClass = (d: number) => (d === 0 ? 'text-emerald-700' : d > 0 ? 'text-sky-700' : 'text-red-700');

/** Cierre mensual: consolida los cierres diarios de la sede y permite cerrar el mes. */
export function MonthlyClose() {
  const { branchId, can } = useAuth();
  const now = new Date(Date.now() - 5 * 3600_000);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const [period, setPeriod] = useState(`${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`);
  const [year, month] = period.split('-').map(Number);
  const { data } = useApi<MonthData>(['cash', 'monthly', branchId, period], year && month ? `/cash/monthly?year=${year}&month=${month}` : null);
  const history = useApi<HistoryRow[]>(['cash', 'monthly', 'history', branchId], '/cash/monthly/history');
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState('');
  const close = useApiMutation(() => api('/cash/monthly/close', { method: 'POST', json: { year, month, notes: notes || undefined } }), {
    invalidate: [['cash', 'monthly']],
    success: 'Mes cerrado',
  });

  const days = (data?.byDay ?? []).map((d) => ({ key: d.day, label: d.day.slice(8, 10), value: d.total, hint: `${d.count} ventas` }));
  const totalDiff = data ? METHODS.reduce((s, m) => s + data.differences[m], 0) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Mes"><Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></Field>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>
          {data && !data.closed && can('cash.monthly') && (
            <Button disabled={!data.canClose} onClick={() => setClosing(true)}><Lock className="size-4" /> Cerrar {MONTHS[month - 1]}</Button>
          )}
        </div>
      </div>

      {!data ? <p className="text-slate-500">Cargando…</p> : (
        <>
          {data.closed ? (
            <Alert tone="success">
              <span className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="size-4" /> Mes cerrado por {data.closed.by} el {formatDateTime(data.closed.at)}. Estos valores quedaron guardados.
                {data.closed.notes && <span className="w-full">Notas: {data.closed.notes}</span>}
              </span>
            </Alert>
          ) : (
            <Alert tone={data.canClose ? 'info' : 'error'}>
              {data.canClose ? 'El mes está listo para cerrarse. Revisa los valores antes de confirmar.' : `Aún no se puede cerrar: ${data.blockers.join('. ')}. Los valores son preliminares.`}
            </Alert>
          )}

          <h2 className="text-xl font-bold">{MONTHS[month - 1].charAt(0).toUpperCase() + MONTHS[month - 1].slice(1)} de {year}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat tone="brand" label="Ventas del mes" value={formatCOP(data.totals.salesTotal)} hint={`${data.totals.salesCount} ventas · ticket ${formatCOP(data.totals.avgTicket)}`} />
            <Stat label="Propinas" value={formatCOP(data.totals.tips)} />
            <Stat label="Gastos" value={formatCOP(data.totals.expenses)} hint={data.totals.expensesTransfer ? `Por transferencia ${formatCOP(data.totals.expensesTransfer)}` : undefined} />
            <Stat label="Diferencias de caja" value={formatCOP(totalDiff)} hint={`${data.days.length} cierres diarios`} />
            {data.totals.purchases > 0 && <Stat label="Compras" value={formatCOP(data.totals.purchases)} />}
            {data.totals.grossProfit != null && (data.totals.cost ?? 0) > 0 && <Stat label="Utilidad bruta" value={formatCOP(data.totals.grossProfit)} hint={`Costo ${formatCOP(data.totals.cost ?? 0)}`} />}
            <Stat label="Anuladas" value={formatCOP(data.totals.voidedTotal)} hint={`${data.totals.voidedCount} ventas`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <h3 className="mb-3 font-semibold">Ventas por día</h3>
              <BarChart label="Ventas por día del mes" data={days} format={shortCOP} height={180} />
            </Card>
            <Card className="xl:col-span-2">
              <h3 className="mb-3 font-semibold">Por método de pago</h3>
              <Table>
                <thead><tr><th>Método</th><th className="text-right">Ventas</th><th className="text-right">Diferencia</th></tr></thead>
                <tbody>
                  {data.byMethod.map((m) => (
                    <tr key={m.method}>
                      <td>{PAYMENT_LABELS[m.method]}</td>
                      <td className="text-right tabular-nums">{formatCOP(m.sales)}{m.tips > 0 && <p className="text-xs text-slate-500">+ {formatCOP(m.tips)} propinas</p>}</td>
                      <td className={clsx('text-right font-semibold tabular-nums', diffClass(data.differences[m.method as keyof ByMethod] ?? 0))}>{formatCOP(data.differences[m.method as keyof ByMethod] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card>
            <h3 className="mb-3 font-semibold">Cierres diarios</h3>
            <Table>
              <thead>
                <tr><th>Día</th><th>Responsables</th><th className="text-right">Ventas</th><th className="text-right">Propinas</th><th className="text-right">Gastos</th>{METHODS.map((m) => <th key={m} className="text-right">Dif. {PAYMENT_LABELS[m]}</th>)}</tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap">{formatDate(d.openedAt)} {d.status === 'OPEN' && <Badge tone="amber">Abierta</Badge>}</td>
                    <td className="text-slate-600">{d.openedBy}{d.closedBy && d.closedBy !== d.openedBy ? ` / ${d.closedBy}` : ''}</td>
                    <td className="text-right tabular-nums">{formatCOP(d.salesTotal)}</td>
                    <td className="text-right tabular-nums">{formatCOP(d.tipsTotal)}</td>
                    <td className="text-right tabular-nums">{formatCOP(d.expenses)}</td>
                    {METHODS.map((m) => (
                      <td key={m} className={clsx('text-right font-semibold tabular-nums', d.difference ? diffClass(d.difference[m]) : 'text-slate-400')}>
                        {d.difference ? formatCOP(d.difference[m]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.days.length === 0 && <tr><td colSpan={8} className="text-center text-slate-500">Sin cajas en este mes</td></tr>}
              </tbody>
            </Table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 font-semibold">Ventas por categoría</h3>
              <RankList format={formatCOP} rows={data.byCategory.slice(0, 8).map((c) => ({ label: c.name, value: c.total }))} />
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">Gastos por categoría</h3>
              <RankList format={formatCOP} rows={data.expenses.map((e) => ({ label: `${e.category}${e.method === 'TRANSFER' ? ' (transferencia)' : ''}`, value: e.total }))} />
            </Card>
          </div>
        </>
      )}

      {history.data && history.data.length > 0 && (
        <Card>
          <h3 className="mb-3 font-semibold">Meses cerrados</h3>
          <Table>
            <thead><tr><th>Mes</th><th>Cerrado</th><th className="text-right">Ventas</th><th className="text-right">Diferencias</th></tr></thead>
            <tbody>
              {history.data.map((h) => (
                <tr key={h.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setPeriod(`${h.year}-${String(h.month).padStart(2, '0')}`)}>
                  <td className="capitalize">{MONTHS[h.month - 1]} {h.year}</td>
                  <td>{formatDateTime(h.closedAt)}</td>
                  <td className="text-right tabular-nums">{formatCOP(h.salesTotal)}</td>
                  <td className={clsx('text-right font-semibold tabular-nums', diffClass(h.difference))}>{formatCOP(h.difference)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {closing && data && (
        <Modal open size="sm" onClose={() => setClosing(false)} title={`Cerrar ${MONTHS[month - 1]} ${year}`}
          footer={<Button loading={close.isPending} onClick={() => close.mutate(undefined, { onSuccess: () => setClosing(false) })}>Confirmar cierre mensual</Button>}>
          <div className="space-y-3 text-sm">
            <p>Ventas: <b>{formatCOP(data.totals.salesTotal)}</b> · Diferencias: <b className={diffClass(totalDiff)}>{formatCOP(totalDiff)}</b></p>
            <p className="text-slate-500">Se guardará una copia fija de este consolidado. El cierre mensual no se puede repetir.</p>
            <Field label="Observaciones"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
