import { CheckCircle2, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { MoneyInput } from '../../components/MoneyInput';
import { toast } from '../../components/toast';
import { Badge, Button, Checkbox, EmptyState, Field, Input, PageHeader, Select, Table, Tabs } from '../../components/ui';
import { api, upload } from '../../lib/api';
import { formatCOP, formatDate, PAYMENT_LABELS, todayISO } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';

interface Expense {
  id: string;
  branchId: string | null;
  branchName: string;
  categoryId: string | null;
  category: { name: string } | null;
  description: string;
  amount: number;
  method: 'CASH' | 'TRANSFER' | 'QR_BOLD';
  date: string;
  reference: string | null;
  receiptUrl: string | null;
}

interface Recurring {
  id: string;
  branchId: string | null;
  branchName: string;
  categoryId: string | null;
  category: { name: string } | null;
  description: string;
  amount: number;
  method: Expense['method'];
  dayOfMonth: number;
  isActive: boolean;
  registered: { id: string; amount: number; date: string } | null;
}

const monthStart = () => `${todayISO().slice(0, 8)}01`;
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Categoría de gasto con opción de crear una nueva ahí mismo. */
function CategoryField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const categories = useApi<{ id: string; name: string; isActive: boolean }[]>(['admin', 'expense-categories'], '/admin/expense-categories');
  const create = useApiMutation((name: string) => api<{ id: string }>('/admin/expense-categories', { method: 'POST', json: { name } }), {
    invalidate: [['admin', 'expense-categories']], success: 'Categoría creada',
  });
  function add() {
    const name = prompt('Nombre de la nueva categoría (ej. Arrendamiento)')?.trim();
    if (name) create.mutate(name, { onSuccess: (c) => onChange(c.id) });
  }
  return (
    <Field label="Categoría">
      <div className="flex gap-2">
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Sin categoría</option>
          {categories.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button type="button" variant="secondary" loading={create.isPending} onClick={add} aria-label="Nueva categoría" title="Nueva categoría"><Plus className="size-4" /></Button>
      </div>
    </Field>
  );
}

/** Gastos que se repiten cada mes: se registran con un clic en el mes elegido. */
function RecurringTab({ onEdit }: { onEdit: (r: Recurring) => void }) {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const list = useApi<{ month: string; items: Recurring[] }>(['expenses', 'recurring', month], `/expenses/recurring?month=${month}`);
  const opts = { invalidate: [['expenses'], ['cash', 'monthly']] };
  const register = useApiMutation((v: { id: string; amount: number }) => api(`/expenses/recurring/${v.id}/register`, { method: 'POST', json: { month, amount: v.amount } }), { ...opts, success: 'Gasto registrado' });
  const registerAll = useApiMutation(() => api<{ registered: number; total: number }>('/expenses/recurring/register-all', { method: 'POST', json: { month } }), opts);
  const del = useApiMutation((id: string) => api(`/expenses/recurring/${id}`, { method: 'DELETE' }), { ...opts, success: 'Gasto fijo eliminado' });
  const items = list.data?.items ?? [];
  const pending = items.filter((i) => i.isActive && !i.registered);
  const [y, m] = month.split('-').map(Number);

  function registerOne(r: Recurring) {
    const raw = prompt(`Valor de "${r.description}" en ${MONTHS[m - 1]} ${y}`, String(r.amount));
    if (raw === null) return;
    const amount = Number(raw.replace(/\D/g, ''));
    if (amount > 0) register.mutate({ id: r.id, amount });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Mes"><Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
        <p className="flex-1 text-sm text-slate-600">
          {pending.length ? <>Faltan <b>{pending.length}</b> por registrar en {MONTHS[m - 1]} ({formatCOP(pending.reduce((s, i) => s + i.amount, 0))}).</> : items.length ? 'Todos los gastos fijos de este mes están registrados.' : ''}
        </p>
        {pending.length > 0 && (
          <Button loading={registerAll.isPending}
            onClick={() => confirm(`¿Registrar los ${pending.length} gastos fijos pendientes de ${MONTHS[m - 1]} ${y} con su valor habitual?`) &&
              registerAll.mutate(undefined, { onSuccess: (r) => toast.success(`${r.registered} gastos registrados (${formatCOP(r.total)})`) })}>
            Registrar todos los pendientes
          </Button>
        )}
      </div>
      {list.data && items.length === 0 ? (
        <EmptyState>Aún no hay gastos fijos. Crea uno con "Nuevo gasto fijo" (ej. arriendo, nómina, internet).</EmptyState>
      ) : (
        <Table>
          <thead><tr><th>Día</th><th>Descripción</th><th>Categoría</th><th>Sede</th><th>Pago</th><th className="text-right">Valor</th><th>{MONTHS[m - 1]} {y}</th><th /></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className={r.isActive ? '' : 'text-slate-400'}>
                <td>{r.dayOfMonth}</td>
                <td className="font-medium">{r.description} {!r.isActive && <Badge>Inactivo</Badge>}</td>
                <td>{r.category?.name ?? '—'}</td>
                <td>{r.branchName}</td>
                <td>{PAYMENT_LABELS[r.method]}</td>
                <td className="text-right tabular-nums">{formatCOP(r.amount)}</td>
                <td>
                  {r.registered ? (
                    <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> {formatCOP(r.registered.amount)}</span>
                  ) : r.isActive ? (
                    <Button variant="secondary" loading={register.isPending && register.variables?.id === r.id} onClick={() => registerOne(r)}>Registrar</Button>
                  ) : '—'}
                </td>
                <td className="text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => onEdit(r)} aria-label="Editar"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" onClick={() => confirm(`¿Eliminar el gasto fijo "${r.description}"? Los gastos ya registrados se conservan.`) && del.mutate(r.id)} aria-label="Eliminar"><Trash2 className="size-4 text-red-600" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-xs text-slate-500">Al registrar, el gasto queda en "Gastos registrados" con la fecha del día configurado y entra al cierre de ese mes. Puedes cambiar el valor de un mes puntual al registrarlo.</p>
    </div>
  );
}

function RecurringModal({ item, onClose }: { item: Recurring | null; onClose: () => void }) {
  const { session } = useAuth();
  const [form, setForm] = useState({
    description: item?.description ?? '',
    amount: item?.amount ?? 0,
    categoryId: item?.categoryId ?? '',
    branchId: item?.branchId ?? '',
    method: item?.method ?? ('TRANSFER' as Expense['method']),
    dayOfMonth: item?.dayOfMonth ?? 1,
    isActive: item?.isActive ?? true,
  });
  const save = useApiMutation(
    () => api(item ? `/expenses/recurring/${item.id}` : '/expenses/recurring', {
      method: item ? 'PUT' : 'POST',
      json: { ...form, categoryId: form.categoryId || null, branchId: form.branchId || null },
    }),
    { invalidate: [['expenses', 'recurring']], success: 'Gasto fijo guardado' },
  );
  return (
    <Modal open size="md" onClose={onClose} title={item ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
      footer={<Button loading={save.isPending} disabled={!form.amount || form.description.trim().length < 2} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>}>
      <div className="space-y-4">
        <Field label="Descripción"><Input value={form.description} maxLength={300} placeholder="Ej. Arriendo local" onChange={(e) => setForm({ ...form, description: e.target.value })} autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor mensual"><MoneyInput value={form.amount} onChange={(amount) => setForm({ ...form, amount })} /></Field>
          <Field label="Día del mes (1 a 28)">
            <Input type="number" min={1} max={28} value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: Math.min(28, Math.max(1, Math.floor(Number(e.target.value) || 1))) })} />
          </Field>
          <CategoryField value={form.categoryId} onChange={(categoryId) => setForm({ ...form, categoryId })} />
          <Field label="Sede">
            <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">General del negocio</option>
              {session?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Forma de pago">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Expense['method'] })}>
              <option value="TRANSFER">Transferencia</option>
              <option value="CASH">Efectivo (fuera de la caja)</option>
              <option value="QR_BOLD">Tarjeta / Bold</option>
            </Select>
          </Field>
        </div>
        {item && <Checkbox label="Activo (aparece cada mes para registrarlo)" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
      </div>
    </Modal>
  );
}

/** Gastos administrativos: arriendo, nómina, servicios… No pasan por la caja del día. */
export function ExpensesPage() {
  const [tab, setTab] = useState<'list' | 'recurring'>('list');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [editingFixed, setEditingFixed] = useState<Recurring | 'new' | null>(null);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Gastos administrativos" subtitle="Arriendo, nómina, servicios y otros gastos que no salen de la caja del día"
        actions={tab === 'list'
          ? <Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nuevo gasto</Button>
          : <Button onClick={() => setEditingFixed('new')}><Plus className="size-4" /> Nuevo gasto fijo</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'list', label: 'Gastos registrados' }, { value: 'recurring', label: 'Gastos fijos (cada mes)' }]} />
      {tab === 'list' ? <ExpensesList onEdit={setEditing} /> : <RecurringTab onEdit={setEditingFixed} />}
      {editing && <ExpenseModal expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {editingFixed && <RecurringModal item={editingFixed === 'new' ? null : editingFixed} onClose={() => setEditingFixed(null)} />}
    </div>
  );
}

function ExpensesList({ onEdit }: { onEdit: (e: Expense) => void }) {
  const { session } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [branch, setBranch] = useState('all');
  const list = useApi<Expense[]>(['expenses', from, to, branch], `/expenses?from=${from}&to=${to}&branch=${branch}`);
  const del = useApiMutation((id: string) => api(`/expenses/${id}`, { method: 'DELETE' }), { invalidate: [['expenses'], ['cash', 'monthly']], success: 'Gasto eliminado' });
  const total = list.data?.reduce((s, e) => s + e.amount, 0) ?? 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Sede">
          <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="all">Todas</option>
            <option value="general">General del negocio</option>
            {session?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <p className="flex-1 text-right text-sm text-slate-600">Total: <b className="text-base">{formatCOP(total)}</b></p>
      </div>
      {list.data?.length === 0 ? <EmptyState>No hay gastos en este rango.</EmptyState> : (
        <Table>
          <thead><tr><th>Fecha</th><th>Sede</th><th>Categoría</th><th>Descripción</th><th>Pago</th><th className="text-right">Valor</th><th /></tr></thead>
          <tbody>
            {list.data?.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{formatDate(e.date)}</td>
                <td>{e.branchName}</td>
                <td>{e.category?.name ?? '—'}</td>
                <td>
                  {e.description}
                  {e.reference && <span className="ml-1 text-xs text-slate-500">· Ref. {e.reference}</span>}
                  {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-xs text-brand-dark underline"><Paperclip className="size-3" /> soporte</a>}
                </td>
                <td>{PAYMENT_LABELS[e.method]}</td>
                <td className="text-right font-semibold tabular-nums">{formatCOP(e.amount)}</td>
                <td className="text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => onEdit(e)} aria-label="Editar"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" onClick={() => confirm(`¿Eliminar "${e.description}"?`) && del.mutate(e.id)} aria-label="Eliminar"><Trash2 className="size-4 text-red-600" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function ExpenseModal({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    branchId: expense?.branchId ?? '',
    categoryId: expense?.categoryId ?? '',
    description: expense?.description ?? '',
    amount: expense?.amount ?? 0,
    method: expense?.method ?? 'TRANSFER',
    date: expense ? expense.date.slice(0, 10) : todayISO(),
    reference: expense?.reference ?? '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body = { ...form, branchId: form.branchId || null, categoryId: form.categoryId || null, reference: form.reference || undefined };
      const saved = await api<{ id: string }>(expense ? `/expenses/${expense.id}` : '/expenses', { method: expense ? 'PUT' : 'POST', json: body });
      if (file) await upload(`/expenses/${saved.id}/receipt`, file);
      await qc.invalidateQueries({ queryKey: ['expenses'] });
      await qc.invalidateQueries({ queryKey: ['cash', 'monthly'] });
      toast.success('Gasto guardado');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={expense ? 'Editar gasto' : 'Nuevo gasto administrativo'} size="md"
      footer={<Button loading={saving} disabled={!form.amount || form.description.trim().length < 2} onClick={save}>Guardar</Button>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Sede">
            <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">General del negocio</option>
              {session?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <CategoryField value={form.categoryId} onChange={(categoryId) => setForm({ ...form, categoryId })} />
          <Field label="Valor"><MoneyInput value={form.amount} onChange={(amount) => setForm({ ...form, amount })} /></Field>
        </div>
        <Field label="Descripción"><Input value={form.description} maxLength={300} placeholder="Ej. Arriendo local de octubre" onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Forma de pago">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Expense['method'] })}>
              <option value="TRANSFER">Transferencia</option>
              <option value="CASH">Efectivo (fuera de la caja)</option>
              <option value="QR_BOLD">Tarjeta / Bold</option>
            </Select>
          </Field>
          <Field label="Referencia (opcional)"><Input value={form.reference} maxLength={80} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        </div>
        <Field label="Soporte o factura (foto, opcional)">
          <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <p className="text-xs text-slate-500">Estos gastos no afectan la caja del día; se suman en el cierre mensual y en los reportes. Un gasto “General” pertenece a todo el negocio.</p>
      </div>
    </Modal>
  );
}
