import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { MoneyInput } from '../../components/MoneyInput';
import { toast } from '../../components/toast';
import { Button, EmptyState, Field, Input, PageHeader, Select, Table } from '../../components/ui';
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

const monthStart = () => `${todayISO().slice(0, 8)}01`;

/** Gastos administrativos: arriendo, nómina, servicios… No pasan por la caja del día. */
export function ExpensesPage() {
  const { session } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [branch, setBranch] = useState('all');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const list = useApi<Expense[]>(['expenses', from, to, branch], `/expenses?from=${from}&to=${to}&branch=${branch}`);
  const del = useApiMutation((id: string) => api(`/expenses/${id}`, { method: 'DELETE' }), { invalidate: [['expenses'], ['cash', 'monthly']], success: 'Gasto eliminado' });
  const total = list.data?.reduce((s, e) => s + e.amount, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Gastos administrativos" subtitle="Arriendo, nómina, servicios y otros gastos que no salen de la caja del día"
        actions={<Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nuevo gasto</Button>} />
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
                  <Button variant="ghost" onClick={() => setEditing(e)} aria-label="Editar"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" onClick={() => confirm(`¿Eliminar "${e.description}"?`) && del.mutate(e.id)} aria-label="Eliminar"><Trash2 className="size-4 text-red-600" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <ExpenseModal expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ExpenseModal({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const categories = useApi<{ id: string; name: string; isActive: boolean }[]>(['admin', 'expense-categories'], '/admin/expense-categories');
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
          <Field label="Categoría">
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Sin categoría</option>
              {categories.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
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
