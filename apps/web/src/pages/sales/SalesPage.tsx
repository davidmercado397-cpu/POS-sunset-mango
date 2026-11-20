import { useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { SaleDetailView } from '../../components/pos/SaleDetailView';
import type { PaymentMethod, SaleDetail } from '../../components/pos/types';
import { Badge, Button, EmptyState, Field, Input, PageHeader, Select, Table, Tabs, Textarea } from '../../components/ui';
import { MoneyInput } from '../../components/MoneyInput';
import { api, ApiError, download, upload } from '../../lib/api';
import { formatCOP, formatDateTime, formatTime, PAYMENT_LABELS, todayISO, formatDate } from '../../lib/format';
import { toast } from '../../components/toast';
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
  receivable: { debtorName: string; amount: number; paidAmount: number; status: 'PENDING' | 'PAID' | 'CANCELLED' } | null;
  _count: { items: number };
}

export function SalesPage() {
  const { branchId, can } = useAuth();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const sales = useApi<SaleRow[]>(['sales', branchId, from, to, status], `/sales?from=${from}&to=${to}&status=${status}`);
  const completed = sales.data?.filter((s) => s.status === 'COMPLETED') ?? [];
  const total = completed.reduce((s, x) => s + x.subtotal, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Ventas" subtitle={sales.data ? `${completed.length} ventas pagadas · ${formatCOP(total)}` : undefined}
        actions={can('sales.import') && <Button variant="secondary" onClick={() => setImporting(true)}><FileSpreadsheet className="size-4" /> Carga masiva</Button>} />
      {importing && <ImportModal onClose={() => setImporting(false)} />}
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
                <td>{[...new Set(s.payments.map((p) => PAYMENT_LABELS[p.method])), ...(s.receivable && s.receivable.status !== 'CANCELLED' ? ['Crédito'] : [])].join(' + ') || '—'}</td>
                <td>{s.createdBy.fullName}</td>
                <td className="text-right font-semibold tabular-nums">{formatCOP(s.subtotal + s.tipAmount)}</td>
                <td>
                  {s.status === 'VOIDED' && <Badge tone="red">Anulada</Badge>}
                  {s.status === 'OPEN' && <Badge tone="amber">Abierta</Badge>}
                  {s.status === 'COMPLETED' && s.receivable?.status === 'PENDING' && <Badge tone="amber">Debe {formatCOP(s.receivable.amount - s.receivable.paidAmount)}</Badge>}
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

interface ImportRow { id: string; fileName: string; rowCount: number; total: number; createdAt: string; createdBy: string }

/** Carga de ventas por Excel: plantilla, archivo, errores por fila e historial con opción de deshacer. */
function ImportModal({ onClose }: { onClose: () => void }) {
  const { branchId, hasModule } = useAuth();
  const lump = hasModule('lump_sales');
  const [mode, setMode] = useState<'excel' | 'total'>(lump ? 'total' : 'excel');
  const qc = useQueryClient();
  const history = useApi<ImportRow[]>(['sales-import', branchId], '/sales-import');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const remove = useApiMutation((id: string) => api(`/sales-import/${id}`, { method: 'DELETE' }), {
    invalidate: [['sales-import', branchId], ['sales'], ['reports']], success: 'Carga deshecha: sus ventas se eliminaron',
  });

  async function send() {
    if (!file) return;
    setBusy(true);
    setErrors([]);
    try {
      const r = await upload<{ rowCount: number; total: number }>('/sales-import', file);
      toast.success(`${r.rowCount} ventas cargadas por ${formatCOP(r.total)}`);
      setFile(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ['sales-import', branchId] }), qc.invalidateQueries({ queryKey: ['sales'] }), qc.invalidateQueries({ queryKey: ['reports'] })]);
    } catch (err) {
      const list = err instanceof ApiError ? (err.details as { errors?: string[] } | undefined)?.errors : undefined;
      if (list?.length) setErrors(list);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open size="lg" onClose={onClose} title="Carga masiva de ventas">
      <div className="space-y-5 text-sm">
        {lump && <Tabs value={mode} onChange={setMode} tabs={[{ value: 'total', label: 'Por valor total' }, { value: 'excel', label: 'Desde Excel' }]} />}
        {mode === 'total' ? <LumpSalesForm /> : (
        <>
        <ol className="list-decimal space-y-1 pl-5 text-slate-600">
          <li>Descarga la plantilla: trae la hoja <b>Ventas</b> para llenar y la hoja <b>Productos</b> con el código de cada producto.</li>
          <li>Llena una fila por producto vendido: fecha, código, cantidad, método de pago (Efectivo, Transferencia o QR Bold) y valor pagado.{lump && ' En esta sede puedes dejar el código vacío para registrar un valor sin producto.'}</li>
          <li>Sube el archivo. Si alguna fila tiene un error no se carga nada y te mostramos qué corregir.</li>
        </ol>
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Las ventas cargadas quedan en la sede actual con la fecha de cada fila y aparecen en Ventas y Reportes. No afectan la caja del día ni descuentan inventario.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => download('/sales-import/template', 'plantilla-ventas.xlsx').catch(toast.error)}>
            <Download className="size-4" /> Descargar plantilla
          </Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 font-medium hover:bg-slate-50">
            <FileSpreadsheet className="size-4" /> {file ? file.name : 'Elegir archivo .xlsx'}
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrors([]); e.target.value = ''; }} />
          </label>
          <Button disabled={!file} loading={busy} onClick={send}><Upload className="size-4" /> Cargar ventas</Button>
        </div>
        {errors.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
            <p className="mb-1 font-semibold">Corrige estas filas y vuelve a subir el archivo:</p>
            <ul className="list-disc space-y-0.5 pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        </>
        )}
        <div>
          <p className="mb-2 font-semibold">Cargas anteriores en esta sede</p>
          {history.data?.length === 0 ? <p className="text-slate-500">Todavía no hay cargas.</p> : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {history.data?.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{h.fileName}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(h.createdAt)} · {h.createdBy} · {h.rowCount} ventas · {formatCOP(h.total)}</p>
                  </div>
                  <Button variant="ghost" aria-label="Deshacer carga" title="Deshacer carga (elimina sus ventas)"
                    onClick={() => confirm(`¿Deshacer la carga "${h.fileName}"? Se eliminarán sus ${h.rowCount} ventas.`) && remove.mutate(h.id)}>
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

type LumpRow = { date: string; CASH: number; TRANSFER: number; QR_BOLD: number; notes: string };
const emptyLump = (): LumpRow => ({ date: todayISO(), CASH: 0, TRANSFER: 0, QR_BOLD: 0, notes: '' });

/** Ventas por valor total: lo vendido en el día por método de pago, sin detallar productos. */
function LumpSalesForm() {
  const { branchId } = useAuth();
  const [rows, setRows] = useState<LumpRow[]>([emptyLump()]);
  const save = useApiMutation(
    () => api<{ rowCount: number; total: number }>('/sales-import/manual', { method: 'POST', json: { rows: rows.map((r) => ({ ...r, notes: r.notes.trim() || undefined })) } }),
    { invalidate: [['sales-import', branchId], ['sales'], ['reports']] },
  );
  const update = (i: number, patch: Partial<LumpRow>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rowTotal = (r: LumpRow) => r.CASH + r.TRANSFER + r.QR_BOLD;
  const total = rows.reduce((s, r) => s + rowTotal(r), 0);
  const invalid = rows.some((r) => !r.date || rowTotal(r) <= 0);
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        Registra lo vendido en el día sin detallar productos. Cuenta en Ventas, Reportes y el cierre mensual, pero no descuenta inventario, no aparece en ventas por producto y no afecta la caja del día.
      </p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[150px_1fr_1fr_1fr_auto]">
            <Field label="Fecha"><Input type="date" value={r.date} max={todayISO()} onChange={(e) => update(i, { date: e.target.value })} /></Field>
            <Field label="Efectivo"><MoneyInput value={r.CASH} onChange={(CASH) => update(i, { CASH })} placeholder="0" /></Field>
            <Field label="Transferencia"><MoneyInput value={r.TRANSFER} onChange={(TRANSFER) => update(i, { TRANSFER })} placeholder="0" /></Field>
            <Field label="QR / Bold"><MoneyInput value={r.QR_BOLD} onChange={(QR_BOLD) => update(i, { QR_BOLD })} placeholder="0" /></Field>
            <div className="flex items-end">
              {rows.length > 1 && <Button variant="ghost" aria-label="Quitar día" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}><Trash2 className="size-4 text-red-600" /></Button>}
            </div>
            <div className="sm:col-span-5">
              <Input value={r.notes} maxLength={300} placeholder="Observación (opcional)" onChange={(e) => update(i, { notes: e.target.value })} />
            </div>
            <p className="text-right text-xs text-slate-500 sm:col-span-5">Total del día: <b className="text-slate-800">{formatCOP(rowTotal(r))}</b></p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => setRows([...rows, emptyLump()])}>+ Agregar otro día</Button>
        <Button disabled={invalid} loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: (res) => { toast.success(`${res.rowCount} venta(s) registradas por ${formatCOP(res.total)}`); setRows([emptyLump()]); } })}>
          Registrar {formatCOP(total)}
        </Button>
      </div>
    </div>
  );
}
