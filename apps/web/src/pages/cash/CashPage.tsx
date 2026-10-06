import clsx from 'clsx';
import { ArrowDownCircle, ArrowUpCircle, Lock, Receipt, Unlock } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { countTotal, DenominationCounter } from '../../components/DenominationCounter';
import { Modal } from '../../components/Modal';
import { MoneyInput } from '../../components/MoneyInput';
import { Alert, Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Select, Table, Tabs, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP, formatDateTime, formatTime, PAYMENT_LABELS, todayISO } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import { CashSummaryView, Stat } from './CashSummaryView';
import { METHODS, MOVEMENT_LABELS, type ByMethod, type CashMovement, type CashSession, type CashSummary } from './types';

interface Current { session: CashSession | null; summary?: CashSummary; openOrders?: number; denominations: number[] }

export function CashPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'current' | 'history'>('current');
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Caja" subtitle="Apertura, gastos, cuadre y cierre del día" />
      {can('cash.view') && (
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'current', label: 'Caja actual' }, { value: 'history', label: 'Historial de cierres' }]} />
      )}
      {tab === 'current' ? <CurrentCash /> : <CashHistory />}
    </div>
  );
}

function CurrentCash() {
  const { branchId, can } = useAuth();
  const { data, isLoading } = useApi<Current>(['cash', 'current', branchId], '/cash/current', { refetchInterval: 30_000 });
  const [movement, setMovement] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState<{ session: CashSession; summary: CashSummary } | null>(null);

  if (isLoading || !data) return <p className="text-slate-500">Cargando…</p>;
  if (closed) return <ClosedResult result={closed} onDone={() => setClosed(null)} />;
  if (!data.session) {
    return can('cash.open') ? <OpenCash denominations={data.denominations} /> : <EmptyState>No hay caja abierta en esta sede.</EmptyState>;
  }
  const { session, summary } = data;

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><Unlock className="size-6" /></span>
          <div>
            <p className="font-semibold">Caja abierta</p>
            <p className="text-sm text-slate-500">Desde {formatDateTime(session.openedAt)} por {session.openedBy.fullName}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('cash.movements') && <Button variant="secondary" onClick={() => setMovement(true)}><Receipt className="size-4" /> Registrar gasto / movimiento</Button>}
          {can('cash.close') && <Button onClick={() => setClosing(true)}><Lock className="size-4" /> Cerrar caja</Button>}
        </div>
      </Card>

      {summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat tone="brand" label="Efectivo en caja" value={formatCOP(summary.expected.CASH)} hint="Esperado" />
          <Stat label="Transferencias" value={formatCOP(summary.expected.TRANSFER)} />
          <Stat label="QR Bold" value={formatCOP(summary.expected.QR_BOLD)} />
        </div>
      )}
      {summary && <CashSummaryView summary={summary} />}

      <div>
        <h2 className="mb-2 font-semibold">Movimientos de efectivo</h2>
        <MovementsList movements={session.movements ?? []} />
      </div>

      {movement && <MovementModal onClose={() => setMovement(false)} />}
      {closing && summary && (
        <CloseCashModal
          summary={summary}
          openOrders={data.openOrders ?? 0}
          denominations={data.denominations}
          onClose={() => setClosing(false)}
          onClosed={(r) => { setClosing(false); setClosed(r); }}
        />
      )}
    </div>
  );
}

function MovementsList({ movements }: { movements: CashMovement[] }) {
  if (!movements.length) return <EmptyState>Sin gastos ni movimientos.</EmptyState>;
  return (
    <Table>
      <thead><tr><th>Hora</th><th>Tipo</th><th>Detalle</th><th>Usuario</th><th className="text-right">Valor</th></tr></thead>
      <tbody>
        {movements.map((m) => (
          <tr key={m.id}>
            <td className="whitespace-nowrap">{formatTime(m.createdAt)}</td>
            <td className="whitespace-nowrap">
              <span className={clsx('inline-flex items-center gap-1 font-medium', m.type === 'DEPOSIT' ? 'text-emerald-700' : 'text-red-700')}>
                {m.type === 'DEPOSIT' ? <ArrowDownCircle className="size-4" /> : <ArrowUpCircle className="size-4" />}
                {MOVEMENT_LABELS[m.type]}
              </span>
            </td>
            <td>{[m.category?.name, m.description].filter(Boolean).join(' · ')}</td>
            <td>{m.createdBy.fullName}</td>
            <td className="text-right font-semibold tabular-nums">{m.type === 'DEPOSIT' ? '+' : '−'}{formatCOP(m.amount)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function OpenCash({ denominations }: { denominations: number[] }) {
  const [byCount, setByCount] = useState(true);
  const [count, setCount] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const open = useApiMutation(
    () => api('/cash/open', { method: 'POST', json: byCount ? { openingAmount: countTotal(denominations, count), openingCount: count, notes: notes || undefined } : { openingAmount: amount, notes: notes || undefined } }),
    { invalidate: [['cash'], ['pos']], success: 'Caja abierta' },
  );
  return (
    <Card className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-slate-100 p-3"><Lock className="size-6 text-slate-600" /></span>
        <div>
          <p className="text-lg font-semibold">Abrir caja</p>
          <p className="text-sm text-slate-500">Registra la base en efectivo con la que inicia el turno.</p>
        </div>
      </div>
      <Checkbox label="Contar por billetes y monedas" checked={byCount} onChange={(e) => setByCount(e.target.checked)} />
      {byCount ? <DenominationCounter denominations={denominations} value={count} onChange={setCount} /> : (
        <Field label="Base inicial"><MoneyInput value={amount} onChange={setAmount} /></Field>
      )}
      <Field label="Observaciones (opcional)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button className="w-full" loading={open.isPending} onClick={() => open.mutate()}>
        Abrir caja con {formatCOP(byCount ? countTotal(denominations, count) : amount)}
      </Button>
    </Card>
  );
}

function MovementModal({ onClose }: { onClose: () => void }) {
  const categories = useApi<{ id: string; name: string; isActive: boolean }[]>(['admin', 'expense-categories'], '/admin/expense-categories');
  const [type, setType] = useState<CashMovement['type']>('EXPENSE');
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const save = useApiMutation(
    () => api('/cash/movements', { method: 'POST', json: { type, amount, categoryId: type === 'EXPENSE' && categoryId ? categoryId : undefined, description: description || undefined } }),
    { invalidate: [['cash']], success: 'Movimiento registrado' },
  );
  return (
    <Modal open onClose={onClose} title="Registrar movimiento" size="md"
      footer={<Button loading={save.isPending} disabled={!amount} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(MOVEMENT_LABELS) as CashMovement['type'][]).map((t) => (
            <button key={t} onClick={() => setType(t)} className={clsx('min-h-14 rounded-xl border px-2 text-sm font-semibold', type === t ? 'border-brand bg-brand/10' : 'border-slate-200')}>
              {MOVEMENT_LABELS[t]}
            </button>
          ))}
        </div>
        <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        {type === 'EXPENSE' && (
          <Field label="Categoría">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Otro (escribe la descripción)</option>
              {categories.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={type === 'EXPENSE' && !categoryId ? 'Descripción (obligatoria)' : 'Descripción'}>
          <Input value={description} maxLength={300} placeholder={type === 'EXPENSE' ? 'Ej. compra de hielo' : 'Ej. consignación al banco'} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Los gastos y salidas se descuentan del efectivo esperado en caja; las entradas lo aumentan.</p>
      </div>
    </Modal>
  );
}

function CloseCashModal({ summary, openOrders, denominations, onClose, onClosed }: {
  summary: CashSummary; openOrders: number; denominations: number[]; onClose: () => void; onClosed: (r: { session: CashSession; summary: CashSummary }) => void;
}) {
  const [byCount, setByCount] = useState(true);
  const [count, setCount] = useState<Record<string, number>>({});
  const [counted, setCounted] = useState<ByMethod>({ CASH: 0, TRANSFER: summary.expected.TRANSFER, QR_BOLD: summary.expected.QR_BOLD });
  const [notes, setNotes] = useState('');
  const cash = byCount ? countTotal(denominations, count) : counted.CASH;
  const values: ByMethod = { ...counted, CASH: cash };
  const close = useApiMutation(
    () => api<{ session: CashSession; summary: CashSummary }>('/cash/close', { method: 'POST', json: { counted: values, closingCount: byCount ? count : undefined, notes: notes || undefined } }),
    { invalidate: [['cash'], ['pos']], success: 'Caja cerrada' },
  );

  return (
    <Modal open onClose={onClose} title="Cerrar caja" size="lg"
      footer={<Button loading={close.isPending} disabled={openOrders > 0} onClick={() => close.mutate(undefined, { onSuccess: onClosed })}>Confirmar cierre</Button>}>
      <div className="space-y-5">
        {openOrders > 0 && <Alert>Hay {openOrders} cuenta(s) abierta(s). Cóbralas o anúlalas antes de cerrar.</Alert>}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Efectivo</p>
            <Checkbox label="Contar por denominaciones" checked={byCount} onChange={(e) => setByCount(e.target.checked)} />
          </div>
          {byCount ? <DenominationCounter denominations={denominations} value={count} onChange={setCount} /> : (
            <MoneyInput value={counted.CASH} onChange={(v) => setCounted({ ...counted, CASH: v })} />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Transferencias confirmadas"><MoneyInput value={counted.TRANSFER} onChange={(v) => setCounted({ ...counted, TRANSFER: v })} /></Field>
          <Field label="QR Bold confirmado"><MoneyInput value={counted.QR_BOLD} onChange={(v) => setCounted({ ...counted, QR_BOLD: v })} /></Field>
        </div>
        <Table>
          <thead><tr><th>Método</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferencia</th></tr></thead>
          <tbody>
            {METHODS.map((m) => {
              const diff = values[m] - summary.expected[m];
              return (
                <tr key={m}>
                  <td className="font-medium">{PAYMENT_LABELS[m]}</td>
                  <td className="text-right tabular-nums">{formatCOP(summary.expected[m])}</td>
                  <td className="text-right tabular-nums">{formatCOP(values[m])}</td>
                  <td className={clsx('text-right font-bold tabular-nums', diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-sky-700' : 'text-red-700')}>
                    {diff > 0 ? '+' : ''}{formatCOP(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Field label="Observaciones del cierre"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ClosedResult({ result, onDone }: { result: { session: CashSession; summary: CashSummary }; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <Alert tone="success">Caja cerrada el {result.session.closedAt && formatDateTime(result.session.closedAt)}.</Alert>
      <CashSummaryView summary={result.summary} />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => window.print()}>Imprimir</Button>
        <Button onClick={onDone}>Listo</Button>
      </div>
    </div>
  );
}

function CashHistory() {
  const { branchId } = useAuth();
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400_000 - 5 * 3600_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const [selected, setSelected] = useState<string | null>(null);
  const sessions = useApi<CashSession[]>(['cash', 'sessions', branchId, from, to], `/cash/sessions?from=${from}&to=${to}`);
  const detail = useApi<{ session: CashSession; summary: CashSummary }>(['cash', 'session', selected], selected ? `/cash/sessions/${selected}` : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Table>
        <thead><tr><th>Apertura</th><th>Cierre</th><th>Responsables</th><th className="text-right">Ventas</th><th className="text-right">Diferencia</th></tr></thead>
        <tbody>
          {sessions.data?.map((s) => {
            const diff = s.summary?.difference ? METHODS.reduce((sum, m) => sum + s.summary!.difference![m], 0) : null;
            return (
              <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(s.id)}>
                <td className="whitespace-nowrap">{formatDateTime(s.openedAt)}</td>
                <td className="whitespace-nowrap">{s.closedAt ? formatDateTime(s.closedAt) : <span className="font-semibold text-emerald-700">Abierta</span>}</td>
                <td>{s.openedBy.fullName}{s.closedBy && s.closedBy.fullName !== s.openedBy.fullName ? ` / ${s.closedBy.fullName}` : ''}</td>
                <td className="text-right tabular-nums">{s.summary ? formatCOP(s.summary.salesTotal) : '—'}</td>
                <td className={clsx('text-right font-semibold tabular-nums', diff == null ? '' : diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-sky-700' : 'text-red-700')}>
                  {diff == null ? '—' : formatCOP(diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {sessions.data?.length === 0 && <EmptyState>No hay cajas en este rango.</EmptyState>}
      {selected && detail.data && (
        <Modal open size="xl" onClose={() => setSelected(null)} title={`Caja del ${formatDateTime(detail.data.session.openedAt)}`}>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Abrió {detail.data.session.openedBy.fullName}
              {detail.data.session.closedBy && ` · Cerró ${detail.data.session.closedBy.fullName} el ${formatDateTime(detail.data.session.closedAt!)}`}
            </p>
            <CashSummaryView summary={detail.data.summary} />
            {detail.data.session.notes && <Alert tone="info">{detail.data.session.notes}</Alert>}
            <MovementsList movements={detail.data.session.movements ?? []} />
          </div>
        </Modal>
      )}
    </div>
  );
}
